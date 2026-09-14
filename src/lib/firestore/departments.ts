import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import type { FirestoreDepartment } from "@/lib/firestore/types";

const TAG_DEPARTMENTS = "itasset-departments";

const collection = () => adminDb.collection("departments");

export function toDepartmentJson(dept: FirestoreDepartment) {
  return { id: dept.id, name: dept.name, created_at: dept.createdAt };
}

// ⚠️ QUY ƯỚC HẠN MỨC FIRESTORE — ghi lại sau sự cố RESOURCE_EXHAUSTED thật ở app Kho công trình
// (QLK CTR) ngày 13/09/2026 (gói Spark, trần 50.000 lượt đọc/ngày, 1 trang quét toàn bộ lịch sử
// không giới hạn/không cache làm sập cả app). Rà soát 14/09/2026 phát hiện repo này (ITAsset) có
// đúng dạng nguy hiểm đó ở devices/employees/assignments (đọc trọn collection không cache) CỘNG
// thêm lỗi N+1 (đọc riêng 1 lần/nhân viên để lấy tên phòng ban, 1 lần/assignment để lấy tên nhân
// viên). Quy tắc: hàm đọc TOÀN BỘ collection MỚI phải có cache theo thời gian (`unstable_cache`)
// — xem `listDepartments()` dưới đây làm mẫu; hàm tra CỨU 1 bản ghi lặp lại nhiều lần trong 1 vòng
// lặp nên tái dùng list đã cache thay vì đọc lại Firestore từng lần — xem `getDepartment()` dưới
// đây (đổi từ đọc `.doc(id).get()` sang tìm trong `listDepartments()` đã cache).
//
// 🔴 (phát hiện qua review, cùng ngày): bản đầu tiên của bản vá này CHỈ cache theo thời gian,
// KHÔNG làm mới ngay khi ghi — gây bug thật: tạo phòng ban mới xong quay lại "Thêm nhân viên"
// ngay, dropdown/cột "Phòng ban" không thấy phòng ban vừa tạo tới khi cache 60s hết hạn (đặc biệt
// dễ gặp khi import Excel: tạo phòng ban mới rồi dùng NGAY id đó tạo nhân viên trong cùng request).
// Vá: thêm `tags: [TAG_DEPARTMENTS]` + `revalidateTag()` ngay trong `createDepartment()` — làm mới
// cache NGAY khi có phòng ban mới, không cần chờ hết 60s.
export const listDepartments = unstable_cache(
  async (): Promise<FirestoreDepartment[]> => {
    const snap = await collection().orderBy("name").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreDepartment);
  },
  ["itasset-departments"],
  { revalidate: 60, tags: [TAG_DEPARTMENTS] },
);

/** Tra cứu 1 phòng ban theo id — tái dùng `listDepartments()` đã cache thay vì đọc lại Firestore
 *  mỗi lần gọi (trước đây gây N+1 thật: `toEmployeeJson()` gọi hàm này 1 lần/nhân viên). An toàn
 *  vì `createDepartment()` luôn `revalidateTag()` ngay khi có phòng ban mới (xem dưới). */
export async function getDepartment(id: string): Promise<FirestoreDepartment | null> {
  const all = await listDepartments();
  return all.find((d) => d.id === id) ?? null;
}

export async function createDepartment(name: string): Promise<FirestoreDepartment> {
  const createdAt = new Date().toISOString();
  const ref = await collection().add({ name, createdAt });
  revalidateTag(TAG_DEPARTMENTS, { expire: 0 });
  return { id: ref.id, name, createdAt };
}
