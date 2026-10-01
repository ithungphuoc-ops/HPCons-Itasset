import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getHpcoreDb } from "@/lib/hpcore";
import type { FirestoreDepartment, FirestoreEmployee } from "@/lib/firestore/types";

// Đồng bộ Nhân viên từ App Tổng HPcore (Đợt 3 Kho Tổng, 01/10/2026 — Sếp chốt "Nhân viên lấy từ
// HPcore"). Đọc `users` (isActive == true) + `departments` của project hpcons-portal — ĐÚNG mẫu
// các app con khác đang chạy thật (HPcons-Thumua `fetchDanhBaCongTy`, base-request-app directory).
//
// Ghi VÀO collection `employees` sẵn có (khớp theo email) thay vì thay hẳn nguồn: giữ nguyên mã NV,
// QR nhân viên đã in, trang /employee/[code], "Thiết bị của tôi" (tra theo email).
//
// TIẾT KIỆM LƯỢT ĐỌC (App Tổng từng hết hạn mức 21/08/2026): chỉ đồng bộ tối đa 1 lần / 24 giờ
// (tự chạy khi có người mở danh sách Nhân viên) + nút "Đồng bộ ngay" cho Admin. Mỗi lần ≈ số
// người + số phòng ban lượt đọc ở App Tổng; chỉ GHI những người có thay đổi.

const META = () => adminDb.collection("settings").doc("hpcore_sync");
export const TAG_HPCORE_SYNC = "itasset-hpcore-sync";
const TAG_ACTIVE_EMPLOYEES = "itasset-active-employees";
const TAG_DEPARTMENTS = "itasset-departments";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SyncResult {
  syncedAt: string;
  by: string | null;
  hpcoreUsers: number;
  created: number;
  updated: number;
  deactivated: number;
  unchanged: number;
  newDepartments: number;
  error?: string | null;
}

export const getSyncMeta = unstable_cache(
  async (): Promise<SyncResult | null> => {
    const s = await META().get();
    return s.exists ? (s.data() as SyncResult) : null;
  },
  ["itasset-hpcore-sync-meta"],
  { revalidate: 300, tags: [TAG_HPCORE_SYNC] },
);

const norm = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const normEmail = (s: unknown) => norm(s).toLowerCase();
const normName = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

let running: Promise<SyncResult> | null = null;

export async function syncFromHpcore(by: string | null): Promise<SyncResult> {
  // Gộp các lần gọi trùng lúc (2 người mở trang cùng lúc) thành 1 lần đọc App Tổng
  if (running) return running;
  running = doSync(by).finally(() => { running = null; });
  return running;
}

async function doSync(by: string | null): Promise<SyncResult> {
  const hp = getHpcoreDb();
  const [usersSnap, hpDeptSnap, empSnap, depSnap] = await Promise.all([
    hp.collection("users").where("isActive", "==", true).get(),
    hp.collection("departments").get(),
    adminDb.collection("employees").get(),
    adminDb.collection("departments").get(),
  ]);

  const hpDeptName = new Map<string, string>();
  hpDeptSnap.forEach((d) => hpDeptName.set(d.id, norm(d.data().name)));

  // Phòng ban cục bộ — khớp theo tên; thiếu thì tạo mới
  const localDept = new Map<string, FirestoreDepartment>();
  depSnap.forEach((d) => { const x = { id: d.id, ...d.data() } as FirestoreDepartment; localDept.set(normName(x.name || ""), x); });

  const byEmail = new Map<string, FirestoreEmployee>();
  const byUid = new Map<string, FirestoreEmployee>();
  empSnap.forEach((d) => {
    const e = { id: d.id, ...d.data() } as FirestoreEmployee;
    if (e.hpcoreUid) byUid.set(e.hpcoreUid, e);
    const em = normEmail(e.email);
    if (em && !byEmail.has(em)) byEmail.set(em, e);
  });

  const now = new Date().toISOString();
  const ops: [FirebaseFirestore.DocumentReference, Record<string, unknown>][] = [];
  let created = 0, updated = 0, unchanged = 0, newDepartments = 0;
  const seen = new Set<string>();

  for (const u of usersSnap.docs) {
    const data = u.data();
    const email = normEmail(data.email);
    const fullName = norm(data.fullName) || (email ? email.split("@")[0] : "");
    if (!fullName) continue;
    const deptName = data.departmentId ? hpDeptName.get(String(data.departmentId)) || "" : "";
    let departmentId: string | null = null;
    if (deptName) {
      let dep = localDept.get(normName(deptName));
      if (!dep) {
        const ref = adminDb.collection("departments").doc();
        dep = { id: ref.id, name: deptName, createdAt: now };
        localDept.set(normName(deptName), dep);
        ops.push([ref, { name: deptName, createdAt: now }]);
        newDepartments++;
      }
      departmentId = dep.id;
    }
    const title = norm(data.title) || null;
    const existing = byUid.get(u.id) || (email ? byEmail.get(email) : undefined);
    if (existing) {
      seen.add(existing.id);
      const patch: Record<string, unknown> = {};
      if (existing.fullName !== fullName) {
        patch.fullName = fullName;
        // Giữ tên cũ: phiếu Cấp phát / Thu hồi đã gõ theo tên cũ vẫn ra đúng "Thiết bị của tôi"
        if (existing.fullName) patch.aliases = FieldValue.arrayUnion(existing.fullName);
      }
      if (email && normEmail(existing.email) !== email) patch.email = email;
      // Người chưa có phòng ban bên HPcore → giữ phòng ban cục bộ đang có (không xoá trắng)
      if (departmentId && existing.departmentId !== departmentId) patch.departmentId = departmentId;
      if (!existing.isActive) patch.isActive = true;
      if (existing.hpcoreUid !== u.id) patch.hpcoreUid = u.id;
      if ((existing.title ?? null) !== title) patch.title = title;
      if (Object.keys(patch).length) { ops.push([adminDb.collection("employees").doc(existing.id), { ...patch, hpcoreSyncedAt: now }]); updated++; }
      else unchanged++;
    } else {
      const ref = adminDb.collection("employees").doc();
      ops.push([ref, { fullName, email: email || null, phone: null, departmentId, employeeCode: null, isActive: true, createdAt: now, hpcoreUid: u.id, title, hpcoreSyncedAt: now }]);
      created++;
    }
  }

  // Đã từng đồng bộ (có hpcoreUid) mà nay không còn trong App Tổng (nghỉ việc / bị khoá) → ngưng.
  // Người chưa từng khớp HPcore (nhập tay cũ, không email) KHÔNG đụng tới — tránh lỡ ẩn hàng loạt.
  let deactivated = 0;
  empSnap.forEach((d) => {
    const e = d.data() as FirestoreEmployee;
    if (e.hpcoreUid && e.isActive && !seen.has(d.id) && !usersSnap.docs.some((u) => u.id === e.hpcoreUid)) {
      ops.push([d.ref, { isActive: false, hpcoreSyncedAt: now }]);
      deactivated++;
    }
  });

  for (let i = 0; i < ops.length; i += 400) {
    const batch = adminDb.batch();
    ops.slice(i, i + 400).forEach(([ref, data]) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }

  const result: SyncResult = { syncedAt: now, by, hpcoreUsers: usersSnap.size, created, updated, deactivated, unchanged, newDepartments, error: null };
  await META().set(result);
  revalidateTag(TAG_HPCORE_SYNC, { expire: 0 });
  if (ops.length) { revalidateTag(TAG_ACTIVE_EMPLOYEES, { expire: 0 }); revalidateTag(TAG_DEPARTMENTS, { expire: 0 }); }
  return result;
}

/** Gọi khi mở danh sách Nhân viên: quá 24 giờ chưa đồng bộ thì đồng bộ. Lỗi không chặn trang. */
// Lỗi (App Tổng không trả lời…) → nghỉ 10 phút mới thử lại, không đọc dồn mỗi lần mở trang
let lastFail = 0;
export async function syncIfStale(): Promise<void> {
  if (Date.now() - lastFail < 10 * 60 * 1000) return;
  try {
    const meta = await getSyncMeta();
    if (meta && Date.now() - Date.parse(meta.syncedAt) < DAY_MS) return;
    await syncFromHpcore("tự động");
  } catch (err) {
    lastFail = Date.now();
    console.error("Đồng bộ HPcore lỗi:", (err as Error).message);
  }
}
