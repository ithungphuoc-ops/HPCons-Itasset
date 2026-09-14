import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { toDepartmentJson, getDepartment } from "@/lib/firestore/departments";
import type { FirestoreEmployee } from "@/lib/firestore/types";

const collection = () => adminDb.collection("employees");
const TAG_ACTIVE_EMPLOYEES = "itasset-active-employees";

export async function toEmployeeJson(employee: FirestoreEmployee) {
  const department = employee.departmentId ? await getDepartment(employee.departmentId) : null;
  return {
    id: employee.id,
    full_name: employee.fullName,
    email: employee.email,
    phone: employee.phone,
    department_id: employee.departmentId,
    employee_code: employee.employeeCode,
    is_active: employee.isActive,
    created_at: employee.createdAt,
    department: department ? toDepartmentJson(department) : null,
  };
}

// ⚠️ Xem quy ước hạn mức Firestore đầy đủ ở đầu lib/firestore/departments.ts. Chỉ cache
// `listActiveEmployees()` — KHÔNG đổi `getEmployeeById()` sang tra từ list này dù cùng dạng N+1,
// vì list này CHỈ gồm nhân viên đang active (`where isActive==true`) — nhân viên đã nghỉ (cần
// hiện lại trong lịch sử assignment cũ) sẽ không tìm thấy nếu tra nhầm từ đây. `getEmployeeById()`
// phải luôn đọc trực tiếp để đúng cho CẢ nhân viên đã nghỉ.
export const listActiveEmployees = unstable_cache(
  async (): Promise<FirestoreEmployee[]> => {
    const snap = await collection().where("isActive", "==", true).orderBy("fullName").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreEmployee);
  },
  ["itasset-active-employees"],
  { revalidate: 30, tags: [TAG_ACTIVE_EMPLOYEES] },
);

export async function getEmployeeById(id: string): Promise<FirestoreEmployee | null> {
  const doc = await collection().doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as FirestoreEmployee) : null;
}

export async function findEmployeeByEmployeeCode(code: string): Promise<FirestoreEmployee | null> {
  const snap = await collection().where("employeeCode", "==", code).limit(1).get();
  return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as FirestoreEmployee);
}

export async function findEmployeeByEmail(email: string): Promise<FirestoreEmployee | null> {
  const snap = await collection().where("email", "==", email).limit(1).get();
  return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as FirestoreEmployee);
}

export interface CreateEmployeeInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  departmentId?: string | null;
  employeeCode?: string | null;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<FirestoreEmployee> {
  const employee: Omit<FirestoreEmployee, "id"> = {
    fullName: input.fullName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    departmentId: input.departmentId ?? null,
    employeeCode: input.employeeCode ?? null,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  const ref = await collection().add(employee);
  revalidateTag(TAG_ACTIVE_EMPLOYEES, { expire: 0 });
  return { id: ref.id, ...employee };
}

export async function updateEmployee(id: string, input: Partial<CreateEmployeeInput>): Promise<void> {
  await collection().doc(id).set(input, { merge: true });
  revalidateTag(TAG_ACTIVE_EMPLOYEES, { expire: 0 });
}

export async function deactivateEmployee(id: string): Promise<void> {
  await collection().doc(id).set({ isActive: false }, { merge: true });
  revalidateTag(TAG_ACTIVE_EMPLOYEES, { expire: 0 });
}
