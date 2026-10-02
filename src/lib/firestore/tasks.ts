import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import type { FirestoreTask } from "@/lib/firestore/types";

const collection = () => adminDb.collection("tasks");
export const TAG_TASKS = "itasset-tasks";

function fromDoc(doc: FirebaseFirestore.DocumentSnapshot): FirestoreTask {
  return { id: doc.id, ...doc.data() } as FirestoreTask;
}

// Cùng quy ước cache 30s + revalidateTag ở mọi hàm ghi như devices.ts/departments.ts — tránh
// đúng lỗi "tạo/sửa xong chưa thấy ngay" đã từng gặp ở các module khác của app này.
export const listAllTasks = unstable_cache(
  async (): Promise<FirestoreTask[]> => {
    const snap = await collection().orderBy("createdAt", "desc").get();
    return snap.docs.map(fromDoc);
  },
  ["itasset-tasks"],
  { revalidate: 30, tags: [TAG_TASKS] },
);

export async function getTaskById(id: string): Promise<FirestoreTask | null> {
  const doc = await collection().doc(id).get();
  return doc.exists ? fromDoc(doc) : null;
}

export interface CreateTaskInput {
  type: FirestoreTask["type"];
  title: string;
  requesterName: string;
  assigneeName?: string | null;
  deviceId?: string | null;
  priority: FirestoreTask["priority"];
  dueDate: string;
}

export async function createTask(input: CreateTaskInput): Promise<FirestoreTask> {
  const now = new Date().toISOString();
  const task: Omit<FirestoreTask, "id"> = {
    type: input.type,
    title: input.title,
    requesterName: input.requesterName,
    assigneeName: input.assigneeName ?? null,
    deviceId: input.deviceId ?? null,
    priority: input.priority,
    dueDate: input.dueDate,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
  const ref = await collection().add(task);
  revalidateTag(TAG_TASKS, { expire: 0 });
  return { id: ref.id, ...task };
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  await collection().doc(id).set({ completed, updatedAt: new Date().toISOString() }, { merge: true });
  revalidateTag(TAG_TASKS, { expire: 0 });
}

/**
 * Giao Phụ trách cho công việc CHƯA phân công (nút ＋ ở danh sách, Sếp chốt 02/10/2026).
 * Đã có người phụ trách thì KHÔNG đổi được — kiểm tra trong transaction để 2 người bấm cùng lúc
 * không giao đè lên nhau. Trả về false nếu việc đã có người.
 */
export async function assignTaskIfEmpty(id: string, assigneeName: string): Promise<boolean> {
  const ref = collection().doc(id);
  const ok = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("Không tìm thấy công việc");
    if ((snap.data() as FirestoreTask).assigneeName) return false;
    tx.set(ref, { assigneeName, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
  if (ok) revalidateTag(TAG_TASKS, { expire: 0 });
  return ok;
}

export async function deleteTask(id: string): Promise<void> {
  await collection().doc(id).delete();
  revalidateTag(TAG_TASKS, { expire: 0 });
}
