import "server-only";
import { revalidateTag } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { TAG_DEVICES, buildDeviceDoc, listAllDevices, specsOf } from "@/lib/firestore/devices";
import { computeHolders } from "@/lib/kho/holders";
import { getKhoSettings } from "@/lib/firestore/settings";
import { baseRequired, deviceNameS, missingSpecs, specFieldsOf, type KhoSettings } from "@/lib/kho/settings";
import { MOVE_DEFS, TAX_CODE_RE, assetCodeError, normalizeVi, stockHeld, stockLeft, type StockNumbers } from "@/lib/kho/config";
import { cleanPhotos, type MovePhoto } from "@/lib/kho/photos";
import { deleteFiles } from "@/lib/r2";
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

// Thiết bị khai báo mới ngay trong phiếu Nhập kho (Sếp duyệt demo 10/10/2026: "Nhập kho là cửa vào")
export interface NewDeviceInput {
  assetCode: string;
  category: string;
  brand: string;
  model: string;
  serialNumber?: string | null;
  warrantyFrom?: string | null;
  warrantyExpiry?: string | null;
  specs?: Record<string, string>;
}

export interface CreateMoveInput {
  type: MoveType;
  date: string;
  info: Record<string, string | undefined>;
  dnSo?: string | null;
  dnDate?: string | null;
  // deviceId = thiết bị có sẵn · newDevice = khai báo mới (chỉ Nhập kho) · fillSpecs = điền nốt ô
  // thông số còn trống của thiết bị có sẵn (Nhập kho bắt buộc đủ ô bắt buộc mới lưu được)
  lines: { deviceId?: string; newDevice?: NewDeviceInput | null; fillSpecs?: Record<string, string> | null; qty: number; condition: string; note?: string | null }[];
  // Ảnh thiết bị lúc lập phiếu (đã tải lên R2 qua /api/uploads) — 22/10/2026
  photos?: unknown;
}

const cut = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Làm sạch + kiểm tra 1 thiết bị khai báo mới. Chỉ nhận ô thông số đúng của Loại đó.
function cleanNewDevice(raw: unknown, settings: KhoSettings, n: number): NewDeviceInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const assetCode = typeof r.assetCode === "string" ? r.assetCode.trim() : "";
  const codeErr = assetCodeError(assetCode);
  if (codeErr) throw new MoveError(`Dòng ${n}: ${codeErr}`);
  const category = cut(r.category, 80);
  if (!settings.categories.some((c) => c.key === category)) throw new MoveError(`Dòng ${n}: chưa chọn Loại cho thiết bị mới ${assetCode}`);
  const brand = cut(r.brand), model = cut(r.model);
  const need = baseRequired(settings, category); // Hãng / Model bắt buộc theo Loại (PC mặc định không — 23/10/2026)
  if (need.brand && !brand) throw new MoveError(`Dòng ${n}: chưa nhập Hãng cho thiết bị mới ${assetCode}`);
  if (need.model && !model) throw new MoveError(`Dòng ${n}: chưa nhập Model cho thiết bị mới ${assetCode}`);
  const rawSpecs = (r.specs && typeof r.specs === "object" ? r.specs : {}) as Record<string, unknown>;
  const specs: Record<string, string> = {};
  for (const f of specFieldsOf(settings, category)) { const v = cut(rawSpecs[f.key], 300); if (v) specs[f.key] = v; }
  const miss = missingSpecs(settings, category, specs);
  if (miss.length) throw new MoveError(`Dòng ${n}: thiết bị mới ${assetCode} còn thiếu thông số ${miss.map((f) => f.label).join(", ")}`);
  return {
    assetCode, category, brand, model,
    serialNumber: cut(r.serialNumber) || null,
    warrantyFrom: isIsoDate(r.warrantyFrom) ? r.warrantyFrom : null,
    warrantyExpiry: isIsoDate(r.warrantyExpiry) ? r.warrantyExpiry : null,
    specs,
  };
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
    if (v && f.kind === "tax" && !TAX_CODE_RE.test(v)) throw new MoveError(`${f.label} phải gồm 10 số (chi nhánh: 10 số-3 số)`);
    if (v) info[f.key] = v.slice(0, 300);
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new MoveError("Phiếu chưa có thiết bị nào");
  if (input.lines.length > 200) throw new MoveError("Tối đa 200 dòng thiết bị / phiếu");

  // Danh sách Tình trạng + tên Loại lấy theo "Sửa giao diện" (cache 60s)
  const settings = await getKhoSettings();
  // Ảnh thiết bị (tuỳ chọn; Admin có thể bắt buộc theo loại phiếu) + phiếu phải in ký → "Chờ ký"
  const photos = cleanPhotos(input.photos, settings.photo.max);
  if (settings.photo.require[input.type] && !photos.length) throw new MoveError(`Phiếu ${def.label} bắt buộc có ít nhất 1 ảnh thiết bị`);
  const mustSign = !!settings.photo.sign[input.type];
  // Gộp số lượng theo thiết bị để kiểm tra tồn đúng khi 1 thiết bị nằm ở nhiều dòng
  const qtyByDevice = new Map<string, number>();
  const newDevices = new Map<string, NewDeviceInput>(); // id cấp sẵn → thiết bị khai báo mới
  const newCodes = new Map<string, number>();            // mã (bỏ dấu, thường) → dòng, chống trùng trong phiếu
  const fills = new Map<string, Record<string, unknown>>();
  const lineIds: string[] = [];
  input.lines.forEach((l, i) => {
    if (!l || typeof l !== "object") throw new MoveError(`Dòng ${i + 1}: dữ liệu không hợp lệ`);
    let id: string;
    if (l.newDevice) {
      if (input.type !== "NK") throw new MoveError(`Dòng ${i + 1}: mã tài sản không có trong danh mục — thiết bị mới chỉ khai báo ở phiếu Nhập kho`);
      const nd = cleanNewDevice(l.newDevice, settings, i + 1);
      const k = normalizeVi(nd.assetCode);
      if (newCodes.has(k)) throw new MoveError(`Dòng ${i + 1}: mã ${nd.assetCode} trùng với dòng ${newCodes.get(k)}`);
      newCodes.set(k, i + 1);
      id = adminDb.collection("devices").doc().id;
      newDevices.set(id, nd);
    } else {
      if (!l.deviceId || typeof l.deviceId !== "string") throw new MoveError(`Dòng ${i + 1}: chưa chọn mã tài sản`);
      // id Firestore không được chứa "/", không được là "." / ".." hay dạng __x__ (dành riêng)
      if (l.deviceId.includes("/") || l.deviceId.length > 200 || /^\.\.?$/.test(l.deviceId) || /^__.*__$/.test(l.deviceId)) throw new MoveError(`Dòng ${i + 1}: mã tài sản không có trong danh mục — vui lòng kiểm tra lại`);
      id = l.deviceId;
      if (input.type === "NK" && l.fillSpecs && typeof l.fillSpecs === "object") fills.set(id, { ...(fills.get(id) || {}), ...l.fillSpecs });
    }
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new MoveError(`Dòng ${i + 1}: số lượng phải là số nguyên từ 1 trở lên`);
    if (!l.condition) throw new MoveError(`Dòng ${i + 1}: chưa chọn tình trạng`);
    if (!settings.conditions.includes(l.condition)) throw new MoveError(`Dòng ${i + 1}: tình trạng "${String(l.condition).slice(0, 40)}" không còn trong danh sách — tải lại trang rồi chọn lại`);
    qtyByDevice.set(id, (qtyByDevice.get(id) || 0) + l.qty);
    lineIds.push(id);
  });

  // Mã khai báo mới không được trùng danh mục theo kiểu bỏ dấu / không phân biệt hoa thường (QA
  // 12/10: "lt-001" lọt qua khi đã có "LT-001" → popup gộp 2 máy làm 1, phiếu sau ghi nhầm máy).
  // Danh mục có cache nhưng tự làm mới mỗi lần ghi; trong transaction vẫn kiểm khớp chính xác để
  // chống 2 người lưu cùng lúc.
  if (newDevices.size) {
    const taken = new Map((await listAllDevices()).map((d) => [normalizeVi(d.assetCode), d.assetCode]));
    for (const nd of newDevices.values()) {
      const hit = taken.get(normalizeVi(nd.assetCode));
      if (hit) throw new MoveError(`Mã ${nd.assetCode} trùng mã đã có trong danh mục (${hit}) — chọn mã đó trong gợi ý thay vì khai báo mới`);
    }
  }

  const yy = input.date.slice(2, 4);
  const cRef = counterRef(`moves-${input.type}${yy}`);
  const moveRef = collection().doc();
  const deviceIds = [...qtyByDevice.keys()];
  const existingIds = deviceIds.filter((id) => !newDevices.has(id));
  const devRefs = existingIds.map((id) => adminDb.collection("devices").doc(id));

  // Thu hồi / luân chuyển: người giao (TH) / người chuyển (LC) phải ĐANG GIỮ đủ số đó — tên gõ tay
  // nên so khớp theo tên bỏ dấu; gõ lệch tên sẽ bị chặn kèm danh sách người đang giữ để sửa lại.
  const checkPerson = input.type === "TH" || input.type === "LC";
  const personKey = normalizeVi(info.nguoi || "");

  const saved = await adminDb.runTransaction(async (tx) => {
    const [cSnap, ...devSnaps] = await tx.getAll(cRef, ...devRefs);
    const oldMoves = checkPerson
      ? (await Promise.all(deviceIds.map((id) => tx.get(collection().where("deviceIds", "array-contains", id))))).flatMap((s) => s.docs.map(fromDoc))
      : [];
    // Mã khai báo mới không được trùng mã đã có trong danh mục (kiểm trong transaction → 2 người lưu
    // cùng lúc cũng không tạo trùng)
    const dupSnaps = await Promise.all([...newDevices.values()].map((nd) => tx.get(adminDb.collection("devices").where("assetCode", "==", nd.assetCode).limit(1))));
    dupSnaps.forEach((s, i) => {
      if (!s.empty) throw new MoveError(`Mã ${[...newDevices.values()][i].assetCode} đã có trong danh mục — chọn mã đó trong gợi ý thay vì khai báo mới`);
    });
    const devices = new Map<string, FirestoreDevice>();
    devSnaps.forEach((s, i) => {
      if (!s.exists) throw new MoveError(`Mã tài sản không có trong danh mục (id ${existingIds[i]}) — vui lòng kiểm tra lại`);
      devices.set(s.id, { id: s.id, ...s.data() } as FirestoreDevice);
    });

    // Nhập kho thiết bị có sẵn: phải đủ thông số bắt buộc (điền nốt ô trống — ô đã có giữ nguyên)
    const now = new Date().toISOString();
    const specPatch = new Map<string, { specs: Record<string, string>; filled: { field: string; from: string; to: string }[] }>();
    if (input.type === "NK") {
      for (const [id, d] of devices) {
        const cur = specsOf(d);
        const fill = fills.get(id) || {};
        const merged = { ...cur };
        const filled: { field: string; from: string; to: string }[] = [];
        for (const f of specFieldsOf(settings, d.category)) {
          const v = cut(fill[f.key], 300);
          if (v && !String(cur[f.key] ?? "").trim()) { merged[f.key] = v; filled.push({ field: f.label, from: "", to: v }); }
        }
        const miss = missingSpecs(settings, d.category, merged);
        if (miss.length) throw new MoveError(`${d.assetCode}: còn thiếu thông số ${miss.map((f) => f.label).join(", ")} — điền nốt ở dòng thiết bị này rồi lưu`);
        specPatch.set(id, { specs: merged, filled });
      }
    }

    // Kiểm tra số lượng theo từng loại phiếu (thiết bị mới khai báo chỉ có ở Nhập kho → không cần)
    for (const [id, qty] of qtyByDevice) {
      if (newDevices.has(id)) continue;
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

    const lines: MoveLine[] = input.lines.map((l, i) => {
      const id = lineIds[i];
      const nd = newDevices.get(id);
      const note = l.note ? String(l.note).slice(0, 300) : null;
      if (nd) return { deviceId: id, assetCode: nd.assetCode, name: deviceNameS(settings, nd), serial: nd.serialNumber ?? null, qty: l.qty, condition: l.condition, note };
      const d = devices.get(id)!;
      return { deviceId: d.id, assetCode: d.assetCode, name: deviceNameS(settings, d), serial: d.serialNumber ?? null, qty: l.qty, condition: l.condition, note };
    });

    const n = ((cSnap.exists ? cSnap.data()?.n : 0) || 0) + 1;
    const so = `${input.type}${yy}${String(n).padStart(4, "0")}`;
    const move: Omit<FirestoreMove, "id"> = {
      type: input.type,
      so,
      date: input.date,
      info,
      dnSo: input.dnSo ? String(input.dnSo).trim().slice(0, 60) || null : null,
      dnDate: input.dnDate || null,
      lines,
      deviceIds,
      people: [info.nguoi, info.nguoi2].filter(Boolean).map((x) => normalizeVi(x!)),
      createdAt: now,
      createdBy,
      photos,
      signed: [],
      signPending: mustSign,
      signedAt: null,
      signedBy: null,
    };

    for (const [id, qty] of qtyByDevice) {
      const nd = newDevices.get(id);
      if (nd) {
        // Thiết bị khai báo mới: tạo hồ sơ + nhập luôn số lượng, thông số khoá theo phiếu này
        const doc = buildDeviceDoc({ ...nd, quantity: 0, specsLock: { at: now, by: createdBy, so, via: "NK" } }, now);
        tx.create(adminDb.collection("devices").doc(id), { ...doc, stock: applyDelta(doc.stock!, "NK", qty) });
        continue;
      }
      const d = devices.get(id)!;
      const s = applyDelta(deviceStock(d), input.type, qty);
      const broken = lines.some((l) => l.deviceId === id && l.condition === "Hư");
      const patch: Record<string, unknown> = { stock: s, status: nextStatus(d.status, stockHeld(s), input.type, broken), updatedAt: now };
      const sp = specPatch.get(id);
      if (sp) {
        if (sp.filled.length) {
          patch.specs = sp.specs;
          patch.specsLog = FieldValue.arrayUnion({ at: now, by: createdBy, kind: "fill", reason: `Bổ sung khi nhập kho ${so}`, changes: sp.filled });
        }
        // Đủ thông số mà chưa từng khoá (thiết bị cũ) → khoá theo phiếu nhập này
        if (!d.specsLock) patch.specsLock = { at: now, by: createdBy, so, via: sp.filled.length ? "fill" : "NK" };
      }
      tx.set(devRefs[existingIds.indexOf(id)], patch, { merge: true });
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
  let fileKeys: string[] = [];
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new MoveError("Không tìm thấy phiếu");
    const move = fromDoc(snap);
    fileKeys = [...(move.photos || []), ...(move.signed || [])].map((p) => p.key);
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
    // Phiếu Nhập kho đã KHAI BÁO MỚI thiết bị (thiết bị do chính phiếu này tạo) mà thiết bị chưa có
    // phiếu nào khác → xoá luôn thiết bị, để lập lại phiếu / khai báo lại đúng mã đó được (QA 12/10)
    const madeHere = move.type === "NK" && move.so
      ? snaps.filter((s) => { const l = s.exists ? (s.data() as FirestoreDevice).specsLock : null; return !!l && l.via === "NK" && l.so === move.so; })
      : [];
    const orphan = new Set<string>();
    if (madeHere.length) {
      const qs = await Promise.all(madeHere.map((s) => tx.get(collection().where("deviceIds", "array-contains", s.id))));
      qs.forEach((q, i) => { if (q.docs.every((m) => m.id === move.id)) orphan.add(madeHere[i].id); });
    }
    const now = new Date().toISOString();
    snaps.forEach((s, i) => {
      if (!s.exists) return; // thiết bị đã bị xoá — chỉ xoá phiếu
      if (orphan.has(s.id)) { tx.delete(refs[i]); return; }
      const d = { id: s.id, ...s.data() } as FirestoreDevice;
      const st = applyDelta(deviceStock(d), move.type, -qtyByDevice.get(ids[i])!);
      if (stockLeft(st) < 0) throw new MoveError(`${d.assetCode}: không xoá được — số đã cấp ra sẽ lớn hơn số nhập`);
      if (stockHeld(st) < 0) throw new MoveError(`${d.assetCode}: không xoá được — số thu hồi sẽ lớn hơn số đã cấp`);
      tx.set(refs[i], { stock: st, status: nextStatus(d.status, stockHeld(st), move.type, false), updatedAt: now }, { merge: true });
    });
    tx.delete(ref);
  });
  revalidateTag(TAG_DEVICES, { expire: 0 });
  // Phiếu đã xoá thì ảnh đi kèm cũng xoá trên R2 (việc phụ, lỗi thì bỏ qua)
  await deleteFiles(fileKeys);
}

/**
 * Tải ảnh phiếu đã in + ký (22/10/2026). Nối thêm vào ảnh đã có (phiếu nhiều trang), tối đa 20 ảnh;
 * có ảnh là phiếu hết "Chờ ký". Số liệu tồn / người đang giữ đã cập nhật lúc lưu phiếu, ở đây không đụng.
 */
export async function addSignedPhotos(id: string, raw: unknown, by: string | null): Promise<FirestoreMove> {
  const add = cleanPhotos(raw, 20);
  if (!add.length) throw new MoveError("Chưa có ảnh phiếu đã ký");
  const ref = collection().doc(id);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new MoveError("Không tìm thấy phiếu");
    const move = fromDoc(snap);
    const have = new Set((move.signed || []).map((p) => p.key));
    const signed: MovePhoto[] = [...(move.signed || []), ...add.filter((p) => !have.has(p.key))].slice(0, 20);
    const patch = { signed, signPending: false, signedAt: new Date().toISOString(), signedBy: by };
    tx.set(ref, patch, { merge: true });
    return { ...move, ...patch };
  });
}

/** Phiếu đang "Chờ ký" (đã lưu, chưa tải ảnh phiếu đã ký) — chỉ mục 1 trường, không cần chỉ mục ghép */
export async function listPendingSign(): Promise<FirestoreMove[]> {
  const snap = await collection().where("signPending", "==", true).limit(300).get();
  return snap.docs.map(fromDoc).sort(byDateDesc);
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
export async function personHoldings(fullName: string, aliases: string[] = []): Promise<{ holdings: { device: FirestoreDevice; qty: number; since: string }[]; moves: FirestoreMove[] }> {
  // Tên hiện tại + tên cũ (HPcore đổi tên) → gộp phiếu của mọi tên, tính như 1 người
  const names = [...new Set([fullName, ...aliases].map((n) => normalizeVi(n)).filter(Boolean))];
  const lists = await Promise.all(names.map((n) => collection().where("people", "array-contains", n).get()));
  const moves = [...new Map(lists.flatMap((s) => s.docs.map(fromDoc)).map((m) => [m.id, m])).values()].sort(byDateDesc);
  const me = normalizeVi(fullName);
  const alias = new Set(names);
  // Đổi tên các dòng theo tên cũ thành tên hiện tại rồi mới cộng dồn
  const unified = moves.map((m) => ({ ...m, info: { ...m.info,
    nguoi: m.info.nguoi && alias.has(normalizeVi(m.info.nguoi)) ? fullName : m.info.nguoi,
    nguoi2: m.info.nguoi2 && alias.has(normalizeVi(m.info.nguoi2)) ? fullName : m.info.nguoi2 } }));
  const held = computeHolders(unified).filter((h) => normalizeVi(h.name) === me && h.qty > 0);
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
