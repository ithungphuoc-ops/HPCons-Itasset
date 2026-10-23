import "server-only";
import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { TAG_DEVICES, buildDeviceDoc } from "@/lib/firestore/devices";
import { getKhoSettings, saveKhoSettings } from "@/lib/firestore/settings";
import { deviceNameS, missingSpecs, newKey } from "@/lib/kho/settings";
import { assetCodeError, normalizeVi } from "@/lib/kho/config";
import { IMPORT_LYDO, IMPORT_MAX_ROWS, IMPORT_NCC, type ImportPayloadRow } from "@/lib/kho/importExcel";
import type { FirestoreMove } from "@/lib/firestore/types";

// Nhập thiết bị cũ từ Excel (Sếp duyệt 23/10/2026). Mỗi thiết bị: tạo hồ sơ + 1 phiếu Nhập kho (+ 1 phiếu
// Cấp phát nếu có người giữ) dạng "dữ liệu cũ" — so = null, legacy = true, không vào Phiếu chờ ký — giống
// scripts/migrate-kho-tong.mjs. Hồ sơ + phiếu của 1 thiết bị luôn nằm chung 1 batch (không bao giờ có
// thiết bị thiếu phiếu). Máy chủ kiểm lại mọi thứ, không tin bảng xem trước của trình duyệt.

export class ImportError extends Error {}

const cut = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isIso = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export interface ImportResult {
  created: number;
  held: number;
  newCategories: string[];
  skipped: { sheet: string; line: number; code: string; reason: string }[];
}

export async function importDevices(raw: { file?: unknown; date?: unknown; rows?: unknown }, by: { email: string | null; name: string }): Promise<ImportResult> {
  if (!Array.isArray(raw.rows) || !raw.rows.length) throw new ImportError("Không có dòng nào để nhập");
  if (raw.rows.length > IMPORT_MAX_ROWS) throw new ImportError(`Mỗi lần nhập tối đa ${IMPORT_MAX_ROWS} thiết bị`);
  if (!isIso(raw.date)) throw new ImportError("Ngày ghi phiếu không hợp lệ");
  const date = raw.date;
  const file = cut(raw.file, 120) || "file Excel";

  let S = await getKhoSettings();
  // Mã đã có: đọc thẳng Firestore (chỉ trường assetCode) — không dùng danh sách cache 30 giây
  const snap = await adminDb.collection("devices").select("assetCode").get();
  const existing = new Set(snap.docs.map((d) => normalizeVi(String(d.get("assetCode") || ""))));

  const skipped: ImportResult["skipped"] = [];
  const seen = new Set<string>();
  const newCats = new Map<string, string>(); // tên chuẩn hoá → tên Loại mới
  const good: (ImportPayloadRow & { catKey: string | null })[] = [];
  for (const x of raw.rows as Record<string, unknown>[]) {
    const r: ImportPayloadRow = {
      sheet: cut(x?.sheet, 60), line: Number(x?.line) || 0, code: cut(x?.code, 200),
      catKey: typeof x?.catKey === "string" ? x.catKey : null, catLabel: cut(x?.catLabel, 60),
      brand: cut(x?.brand), model: cut(x?.model), serial: cut(x?.serial), holder: cut(x?.holder), pb: cut(x?.pb),
      specs: x?.specs && typeof x.specs === "object" ? (x.specs as Record<string, string>) : {},
    };
    const skip = (reason: string) => skipped.push({ sheet: r.sheet, line: r.line, code: r.code, reason });
    const ce = assetCodeError(r.code);
    if (ce) { skip(ce); continue; }
    const k = normalizeVi(r.code);
    if (seen.has(k)) { skip("Trùng mã trong file"); continue; }
    seen.add(k);
    if (existing.has(k)) { skip("Mã đã có trong app"); continue; }
    // Loại: theo key có sẵn → theo tên → tạo Loại mới
    let catKey = r.catKey && S.categories.some((c) => c.key === r.catKey) ? r.catKey : null;
    if (!catKey) {
      const byName = S.categories.find((c) => normalizeVi(c.label) === normalizeVi(r.catLabel));
      if (byName) catKey = byName.key;
      else if (r.catLabel) newCats.set(normalizeVi(r.catLabel), r.catLabel);
      else { skip("Chưa rõ Loại thiết bị"); continue; }
    }
    good.push({ ...r, catKey });
  }

  // Tạo Loại mới (chưa có trường thông số — Admin thêm ở Sửa giao diện)
  if (newCats.size) {
    const added = [...newCats.values()].map((label) => ({ key: newKey("c_"), label, brandRequired: true, modelRequired: true, specs: [] }));
    S = await saveKhoSettings({ ...S, categories: [...S.categories, ...added] }, by.email);
  }
  const keyOf = (r: { catKey: string | null; catLabel: string }) =>
    r.catKey || S.categories.find((c) => normalizeVi(c.label) === normalizeVi(r.catLabel))!.key;

  const now = new Date().toISOString();
  const devCol = adminDb.collection("devices"), mvCol = adminDb.collection("stock_moves");
  const base = { dnSo: null, dnDate: null, so: null, legacy: true, date, createdAt: now, createdBy: by.email, photos: [], signed: [], signPending: false, signedAt: null, signedBy: null };
  let created = 0, held = 0;
  // ≤ 3 lần ghi / thiết bị → 150 thiết bị / batch (giới hạn Firestore 500)
  for (let i = 0; i < good.length; i += 150) {
    const batch = adminDb.batch();
    let n = 0, h = 0;
    for (const r of good.slice(i, i + 150)) {
      const category = keyOf(r);
      const fields = S.categories.find((c) => c.key === category)?.specs || [];
      const specs: Record<string, string> = {};
      for (const f of fields) { const v = cut(r.specs[f.key], 300); if (v) specs[f.key] = v; }
      const complete = !missingSpecs(S, category, specs).length;
      const ref = devCol.doc();
      const doc = buildDeviceDoc({
        assetCode: r.code, category, brand: r.brand, model: r.model, serialNumber: r.serial || null, quantity: 0,
        status: r.holder ? "in_use" : "in_stock", specs: Object.keys(specs).length ? specs : null,
        specsLock: complete ? { at: now, by: by.email, so: null, via: "add" } : null,
      }, now);
      batch.create(ref, { ...doc, stock: { in: 1, out: r.holder ? 1 : 0, back: 0, move: 0 } });
      const line = { deviceId: ref.id, assetCode: r.code, name: deviceNameS(S, { category, brand: r.brand, model: r.model }), serial: r.serial || null, qty: 1, condition: "Đang sử dụng", note: null };
      const nk: Omit<FirestoreMove, "id"> = { ...base, type: "NK", info: { ncc: IMPORT_NCC, nguoi: by.name, dien: `Nhập từ ${file}` }, lines: [line], deviceIds: [ref.id], people: [] };
      batch.set(mvCol.doc(), nk);
      if (r.holder) {
        const xk: Omit<FirestoreMove, "id"> = { ...base, type: "XK", info: { nguoi: r.holder, pb: r.pb, lydo: IMPORT_LYDO }, lines: [line], deviceIds: [ref.id], people: [normalizeVi(r.holder)] };
        batch.set(mvCol.doc(), xk);
        h++;
      }
      n++;
    }
    try {
      await batch.commit();
    } catch (e) {
      revalidateTag(TAG_DEVICES, { expire: 0 });
      throw new ImportError(`${created ? `Đã nhập ${created} thiết bị thì ` : ""}gặp lỗi khi ghi: ${(e as Error).message}. Chọn lại file và nhập lại — dòng đã nhập sẽ tự bỏ qua ("Mã đã có trong app").`);
    }
    created += n; held += h;
  }
  revalidateTag(TAG_DEVICES, { expire: 0 });
  return { created, held, newCategories: [...newCats.values()], skipped };
}
