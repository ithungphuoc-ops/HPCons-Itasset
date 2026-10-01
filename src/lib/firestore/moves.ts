import "server-only";
import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { TAG_DEVICES } from "@/lib/firestore/devices";
import { computeHolders } from "@/lib/kho/holders";
import { getKhoSettings } from "@/lib/firestore/settings";
import { deviceNameS } from "@/lib/kho/settings";
import { MOVE_DEFS, normalizeVi, stockHeld, stockLeft, type StockNumbers } from "@/lib/kho/config";
import type { DeviceStatus, FirestoreDevice, FirestoreMove, MoveLine, MoveType } from "@/lib/firestore/types";

// Phiếu Nhập kho / Cấp phát / Thu hồi / Luân chuyển (Kho Tổng, 30/09/2026).
// Mọi thay đổi số liệu tồn (devices.stock) đều đi qua createMove()/deleteMove() trong CÙNG 1
// transaction với việc ghi/xoá phiếu — không có đường nào khác sửa tay số tồn, để số liệu luôn
// khớp lịch sử. Đọc lịch sử chỉ khi mở chi tiết 1 thiết bị (array-contains deviceIds).

const collection = () => adminDb.collection("stock_moves");
const counterRef = (key: string) => adminDb.collection("counters").doc(key);

export class MoveError extends Error {}

export function deviceStock(d: Pick<FirestoreDevice, "stock" | "quantity">): StockNumbers {
  const s = d.stock;
  if (s) return { in: s.in || 0, out: s.out || 0, back: s.back || 0, move: s.move || 0 };
  // Thiết bị chưa chạy chuyển dữ liệu cũ (scripts/migrate-kho-tong.ts) — tạm coi số lượng cũ là đã nhập
  return { in: d.quantity || 0, out: 0, back: 0, move: 0 };
}

function fromDoc(doc: FirebaseFirestore.DocumentSnapshot): FirestoreMove {
  return { id: doc.id, ...doc.data() } as FirestoreMove;
}

// Ngày phải CÓ THẬT (Date.parse('2026-02-30') không báo lỗi mà tự lùi sang 02/03 → so ngược lại)
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Trạng thái tự đổi theo số đang giữ: còn người giữ → Đang dùng; hết người giữ → Trong kho
// (thu hồi ghi Tình trạng "Hư" → Hỏng). Thanh lý giữ nguyên. Vẫn sửa tay được ở trang chi tiết.
function nextStatus(current: DeviceStatus, held: number, type: MoveType, anyBroken: boolean): DeviceStatus {
  if (current === "liquidated") return current;
  if (held > 0) return "in_use";
  if (type === "TH" && anyBroken) return "broken";
  if (current === "in_use") return "in_stock";
  return current;
}

function applyDelta(s: StockNumbers, type: MoveType, qty: number): StockNumbers {
  const n = { ...s };
  if (type === "NK") n.in += qty;
  if (type === "XK") n.out += qty;
  if (type === "TH") n.back += qty;
  if (type === "LC") n.move += qty;
  return n;
}

export interface CreateMoveInput {
  type: MoveType;
  date: string;
  info: Record<string, string | undefined>;
  dnSo?: string | null;
  dnDate?: string | null;
  lines: { deviceId: string; qty: number; condition: string; note?: string | null }[];
}

export async function createMove(input: CreateMoveInput, createdBy: string | null): Promise<FirestoreMove> {
  // Object.hasOwn: tránh "constructor"/"toString"… lọt qua như 1 loại phiếu
  if (typeof input.type !== "string" || !Object.hasOwn(MOVE_DEFS, input.type)) throw new MoveError("Loại phiếu không hợp lệ");
  const def = MOVE_DEFS[input.type];
  if (!isIsoDate(input.date)) throw new MoveError("Ngày không hợp lệ");
  if (input.dnDate && !isIsoDate(input.dnDate)) throw new MoveError("Ngày đề nghị không hợp lệ");

  const info: FirestoreMove["info"] = {};
  for (const f of def.fields) {
    const v = String(input.info?.[f.key] ?? "").trim();
    if (f.required && !v) throw new MoveError(`Chưa nhập ${f.label.toLowerCase()}`);
    if (v) info[f.key] = v.slice(0, 300);
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new MoveError("Phiếu chưa có thiết bị nào");
  if (input.lines.length > 200) throw new MoveError("Tối đa 200 dòng thiết bị / phiếu");

  // Danh sách Tình trạng + tên Loại lấy theo "Sửa giao diện" (cache 60s)
  const settings = await getKhoSettings();
  // Gộp số lượng theo thiết bị để kiểm tra tồn đúng khi 1 thiết bị nằm ở nhiều dòng
  const qtyByDevice = new Map<string, number>();
  input.lines.forEach((l, i) => {
    if (!l || typeof l !== "object") throw new MoveError(`Dòng ${i + 1}: dữ liệu không hợp lệ`);
    if (!l.deviceId || typeof l.deviceId !== "string") throw new MoveError(`Dòng ${i + 1}: chưa chọn mã tài sản`);
    // id Firestore không được chứa "/", không được là "." / ".." hay dạng __x__ (dành riêng)
    if (l.deviceId.includes("/") || l.deviceId.length > 200 || /^\.\.?$/.test(l.deviceId) || /^__.*__$/.test(l.deviceId)) throw new MoveError(`Dòng ${i + 1}: mã tài sản không có trong danh mục — vui lòng kiểm tra lại`);
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new MoveError(`Dòng ${i + 1}: số lượng phải là số nguyên từ 1 trở lên`);
    if (!l.condition) throw new MoveError(`Dòng ${i + 1}: chưa chọn tình trạng`);
    if (!settings.conditions.includes(l.condition)) throw new MoveError(`Dòng ${i + 1}: tình trạng "${String(l.condition).slice(0, 40)}" không còn trong danh sách — tải lại trang rồi chọn lại`);
    qtyByDevice.set(l.deviceId, (qtyByDevice.get(l.deviceId) || 0) + l.qty);
  });

  const yy = input.date.slice(2, 4);
  const cRef = counterRef(`moves-${input.type}${yy}`);
  const moveRef = collection().doc();
  const deviceIds = [...qtyByDevice.keys()];
  const devRefs = deviceIds.map((id) => adminDb.collection("devices").doc(id));

  // Thu hồi / luân chuyển: người giao (TH) / người chuyển (LC) phải ĐANG GIỮ đủ số đó — tên gõ tay
  // nên so khớp theo tên bỏ dấu; gõ lệch tên sẽ bị chặn kèm danh sách người đang giữ để sửa lại.
  const checkPerson = input.type === "TH" || input.type === "LC";
  const personKey = normalizeVi(info.nguoi || "");

  const saved = await adminDb.runTransaction(async (tx) => {
    const [cSnap, ...devSnaps] = await tx.getAll(cRef, ...devRefs);
    const oldMoves = checkPerson
      ? (await Promise.all(deviceIds.map((id) => tx.get(collection().where("deviceIds", "array-contains", id))))).flatMap((s) => s.docs.map(fromDoc))
      : [];
    const devices = new Map<string, FirestoreDevice>();
    devSnaps.forEach((s, i) => {
      if (!s.exists) throw new MoveError(`Mã tài sản không có trong danh mục (id ${deviceIds[i]}) — vui lòng kiểm tra lại`);
      devices.set(s.id, { id: s.id, ...s.data() } as FirestoreDevice);
    });

    // Kiểm tra số lượng theo từng loại phiếu
    for (const [id, qty] of qtyByDevice) {
      const d = devices.get(id)!;
      const s = deviceStock(d);
      if (input.type === "XK" && qty > stockLeft(s)) throw new MoveError(`${d.assetCode}: chỉ còn ${stockLeft(s)} trong kho, không cấp ${qty} được`);
      if ((input.type === "TH" || input.type === "LC") && qty > stockHeld(s))
        throw new MoveError(`${d.assetCode}: đang cấp ra ngoài ${stockHeld(s)}, không ${input.type === "TH" ? "thu hồi" : "luân chuyển"} ${qty} được`);
      if (checkPerson) {
        const uniq = [...new Map(oldMoves.map((m) => [m.id, m])).values()];
        const holders = computeHolders(uniq, id).filter((h) => h.qty > 0);
        const mine = holders.find((h) => normalizeVi(h.name) === personKey)?.qty || 0;
        if (qty > mine) {
          const list = holders.map((h) => `${h.name} ${h.qty}`).join(", ") || "chưa ai";
          throw new MoveError(`${d.assetCode}: "${info.nguoi}" đang giữ ${mine}, không ${input.type === "TH" ? "thu hồi" : "chuyển"} ${qty} được. Người đang giữ: ${list} — kiểm tra lại tên`);
        }
      }
    }

    const lines: MoveLine[] = input.lines.map((l) => {
      const d = devices.get(l.deviceId)!;
      return { deviceId: d.id, assetCode: d.assetCode, name: deviceNameS(settings, d), serial: d.serialNumber ?? null, qty: l.qty, condition: l.condition, note: l.note ? String(l.note).slice(0, 300) : null };
    });

    const n = ((cSnap.exists ? cSnap.data()?.n : 0) || 0) + 1;
    const now = new Date().toISOString();
    const move: Omit<FirestoreMove, "id"> = {
      type: input.type,
      so: `${input.type}${yy}${String(n).padStart(4, "0")}`,
      date: input.date,
      info,
      dnSo: input.dnSo ? String(input.dnSo).trim().slice(0, 60) || null : null,
      dnDate: input.dnDate || null,
      lines,
      deviceIds,
      people: [info.nguoi, info.nguoi2].filter(Boolean).map((x) => normalizeVi(x!)),
      createdAt: now,
      createdBy,
    };

    for (const [id, qty] of qtyByDevice) {
      const d = devices.get(id)!;
      const s = applyDelta(deviceStock(d), input.type, qty);
      const broken = lines.some((l) => l.deviceId === id && l.condition === "Hư");
      tx.set(devRefs[deviceIds.indexOf(id)], { stock: s, status: nextStatus(d.status, stockHeld(s), input.type, broken), updatedAt: now }, { merge: true });
    }
    tx.set(cRef, { n }, { merge: true });
    tx.set(moveRef, move);
    return { id: moveRef.id, ...move };
  });

  revalidateTag(TAG_DEVICES, { expire: 0 });
  return saved;
}

/** Xoá phiếu lập nhầm (chỉ Admin) — trả lại số liệu tồn như trước khi lập phiếu. */
export async function deleteMove(id: string): Promise<void> {
  const ref = collection().doc(id);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new MoveError("Không tìm thấy phiếu");
    const move = fromDoc(snap);
    const qtyByDevice = new Map<string, number>();
    move.lines.forEach((l) => qtyByDevice.set(l.deviceId, (qtyByDevice.get(l.deviceId) || 0) + l.qty));
    const ids = [...qtyByDevice.keys()];
    const refs = ids.map((x) => adminDb.collection("devices").doc(x));
    const snaps = refs.length ? await tx.getAll(...refs) : [];
    // Xoá phiếu Cấp phát / Luân chuyển mà người đó đã trả / chuyển tiếp → danh sách "đang giữ" sẽ âm.
    // Chặn: phải xoá phiếu sau (thu hồi / luân chuyển) trước.
    if (move.type === "XK" || move.type === "LC") {
      const others = (await Promise.all(ids.map((x) => tx.get(collection().where("deviceIds", "array-contains", x)))))
        .flatMap((s) => s.docs.map(fromDoc)).filter((m) => m.id !== move.id);
      const uniq = [...new Map(others.map((m) => [m.id, m])).values()];
      for (const x of ids) {
        const neg = computeHolders(uniq, x).find((h) => h.qty < 0);
        if (neg) {
          const code = move.lines.find((l) => l.deviceId === x)?.assetCode || x;
          throw new MoveError(`${code}: không xoá được — "${neg.name}" đã trả / chuyển tiếp thiết bị ở phiếu sau. Xoá phiếu thu hồi / luân chuyển sau đó trước.`);
        }
      }
    }
    const now = new Date().toISOString();
    snaps.forEach((s, i) => {
      if (!s.exists) return; // thiết bị đã bị xoá — chỉ xoá phiếu
      const d = { id: s.id, ...s.data() } as FirestoreDevice;
      const st = applyDelta(deviceStock(d), move.type, -qtyByDevice.get(ids[i])!);
      if (stockLeft(st) < 0) throw new MoveError(`${d.assetCode}: không xoá được — số đã cấp ra sẽ lớn hơn số nhập`);
      if (stockHeld(st) < 0) throw new MoveError(`${d.assetCode}: không xoá được — số thu hồi sẽ lớn hơn số đã cấp`);
      tx.set(refs[i], { stock: st, status: nextStatus(d.status, stockHeld(st), move.type, false), updatedAt: now }, { merge: true });
    });
    tx.delete(ref);
  });
  revalidateTag(TAG_DEVICES, { expire: 0 });
}

export async function getMove(id: string): Promise<FirestoreMove | null> {
  const doc = await collection().doc(id).get();
  return doc.exists ? fromDoc(doc) : null;
}

const byDateDesc = (a: FirestoreMove, b: FirestoreMove) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1;

// Không orderBy trong query (tránh phải tạo chỉ mục ghép) — sắp xếp tại chỗ, số phiếu / 1 thiết bị ít.
export async function listMovesForDevice(deviceId: string): Promise<FirestoreMove[]> {
  const snap = await collection().where("deviceIds", "array-contains", deviceId).get();
  return snap.docs.map(fromDoc).sort(byDateDesc);
}

export async function listMovesForPerson(name: string): Promise<FirestoreMove[]> {
  const key = normalizeVi(name);
  if (!key) return [];
  const snap = await collection().where("people", "array-contains", key).get();
  return snap.docs.map(fromDoc).sort(byDateDesc);
}

/**
 * Thiết bị 1 người đang giữ + các phiếu có tên người đó (Thiết bị của tôi, trang nhân viên, QR
 * nhân viên). So khớp tên đã bỏ dấu vì tên trong phiếu gõ tay.
 */
export async function personHoldings(fullName: string): Promise<{ holdings: { device: FirestoreDevice; qty: number; since: string }[]; moves: FirestoreMove[] }> {
  const moves = await listMovesForPerson(fullName);
  const me = normalizeVi(fullName);
  const held = computeHolders(moves).filter((h) => normalizeVi(h.name) === me && h.qty > 0);
  const snaps = held.length ? await adminDb.getAll(...held.map((h) => adminDb.collection("devices").doc(h.deviceId))) : [];
  const holdings = held
    .map((h, i) => (snaps[i]?.exists ? { device: { id: snaps[i].id, ...snaps[i].data() } as FirestoreDevice, qty: h.qty, since: h.since } : null))
    .filter((x): x is { device: FirestoreDevice; qty: number; since: string } => !!x);
  return { holdings, moves };
}

export async function listRecentMoves(limit: number): Promise<FirestoreMove[]> {
  const snap = await collection().orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map(fromDoc);
}

export async function countMovesForDevice(deviceId: string): Promise<number> {
  const snap = await collection().where("deviceIds", "array-contains", deviceId).limit(1).get();
  return snap.size;
}
