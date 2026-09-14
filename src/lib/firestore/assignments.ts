import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { getDeviceById, setDeviceStatus, toDeviceJson, TAG_DEVICES } from "@/lib/firestore/devices";
import { getEmployeeById, toEmployeeJson } from "@/lib/firestore/employees";
import type { DeviceStatus, FirestoreAssignment } from "@/lib/firestore/types";

const collection = () => adminDb.collection("assignments");
const TAG_ACTIVE_ASSIGNMENTS = "itasset-active-assignments";

function fromDoc(doc: FirebaseFirestore.DocumentSnapshot): FirestoreAssignment {
  return { id: doc.id, ...doc.data() } as FirestoreAssignment;
}

export async function toAssignmentJson(assignment: FirestoreAssignment, opts?: { withDevice?: boolean }) {
  const employee = await getEmployeeById(assignment.employeeId);
  const device = opts?.withDevice ? await getDeviceById(assignment.deviceId) : null;
  return {
    id: assignment.id,
    device_id: assignment.deviceId,
    employee_id: assignment.employeeId,
    assigned_date: assignment.assignedDate,
    returned_date: assignment.returnedDate,
    assigned_by: assignment.assignedBy,
    returned_by: assignment.returnedBy,
    notes: assignment.notes,
    is_active: assignment.isActive,
    quantity: assignment.quantity,
    created_at: assignment.createdAt,
    employee: employee ? await toEmployeeJson(employee) : null,
    ...(opts?.withDevice ? { device: device ? toDeviceJson(device) : null } : {}),
  };
}

export async function listAssignmentsForDevice(deviceId: string): Promise<FirestoreAssignment[]> {
  const snap = await collection().where("deviceId", "==", deviceId).orderBy("createdAt", "desc").get();
  return snap.docs.map(fromDoc);
}

// Xoá toàn bộ lịch sử assignment của 1 device — dùng khi xoá hẳn device,
// khớp hành vi cũ (Supabase xoá luôn assignments liên quan trước khi xoá device).
export async function deleteAllAssignmentsForDevice(deviceId: string): Promise<void> {
  const snap = await collection().where("deviceId", "==", deviceId).get();
  const batch = adminDb.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

export async function listAssignmentsForEmployee(employeeId: string): Promise<FirestoreAssignment[]> {
  const snap = await collection()
    .where("employeeId", "==", employeeId)
    .orderBy("assignedDate", "desc")
    .get();
  return snap.docs.map(fromDoc);
}

export async function getActiveAssignmentForDevice(deviceId: string): Promise<FirestoreAssignment | null> {
  const snap = await collection()
    .where("deviceId", "==", deviceId)
    .where("isActive", "==", true)
    .limit(1)
    .get();
  return snap.empty ? null : fromDoc(snap.docs[0]);
}

export async function listActiveAssignmentsForEmployee(employeeId: string): Promise<FirestoreAssignment[]> {
  const snap = await collection()
    .where("employeeId", "==", employeeId)
    .where("isActive", "==", true)
    .get();
  return snap.docs.map(fromDoc);
}

// ⚠️ Xem quy ước hạn mức Firestore ở đầu lib/firestore/departments.ts — hàm này chạy mỗi lần tải
// trang danh sách thiết bị (kết hợp với listAllDevices()), đúng dạng "quét toàn collection không
// cache" đã gây sự cố ở app khác. `assignDevice()`/`closeActiveAssignment()` bên dưới KHÔNG dùng
// hàm này (tự query riêng theo đúng deviceId trong transaction), nên cache 30s ở đây không ảnh
// hưởng logic đóng/mở assignment lúc cấp phát — chỉ ảnh hưởng độ mới của trang xem danh sách.
export const listAllActiveAssignments = unstable_cache(
  async (): Promise<FirestoreAssignment[]> => {
    const snap = await collection().where("isActive", "==", true).get();
    return snap.docs.map(fromDoc);
  },
  ["itasset-active-assignments"],
  { revalidate: 30, tags: [TAG_ACTIVE_ASSIGNMENTS] },
);

export async function listRecentAssignments(limit: number): Promise<FirestoreAssignment[]> {
  const snap = await collection().orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map(fromDoc);
}

/**
 * Cấp phát thiết bị trong 1 Firestore transaction: đóng assignment active cũ
 * (nếu có) trước khi tạo assignment mới, đồng thời cập nhật status device.
 */
export async function assignDevice(params: {
  deviceId: string;
  employeeId: string;
  notes?: string | null;
  quantity?: number;
}): Promise<void> {
  const assignmentRef = collection().doc();
  const deviceRef = adminDb.collection("devices").doc(params.deviceId);

  await adminDb.runTransaction(async (tx) => {
    const activeSnap = await tx.get(
      collection().where("deviceId", "==", params.deviceId).where("isActive", "==", true),
    );
    activeSnap.docs.forEach((doc) => {
      tx.set(
        doc.ref,
        { isActive: false, returnedDate: new Date().toISOString().split("T")[0] },
        { merge: true },
      );
    });

    const assignment: Omit<FirestoreAssignment, "id"> = {
      deviceId: params.deviceId,
      employeeId: params.employeeId,
      assignedDate: new Date().toISOString().split("T")[0],
      returnedDate: null,
      assignedBy: null,
      returnedBy: null,
      notes: params.notes ?? null,
      isActive: true,
      quantity: params.quantity ?? 1,
      createdAt: new Date().toISOString(),
    };
    tx.set(assignmentRef, assignment);
    tx.set(deviceRef, { status: "in_use", updatedAt: new Date().toISOString() }, { merge: true });
  });
  // Đổi status thiết bị NGAY trong transaction (không qua setDeviceStatus()) — làm mới cả 2 tag.
  revalidateTag(TAG_ACTIVE_ASSIGNMENTS, { expire: 0 });
  revalidateTag(TAG_DEVICES, { expire: 0 });
}

/**
 * Đóng assignment active của 1 device và đổi status device sang trạng thái mới
 * (dùng cho thu hồi/báo hỏng/thanh lý — PATCH /api/assignments).
 */
export async function closeActiveAssignment(params: {
  deviceId: string;
  newStatus: DeviceStatus;
  notes?: string | null;
}): Promise<void> {
  const activeSnap = await collection()
    .where("deviceId", "==", params.deviceId)
    .where("isActive", "==", true)
    .get();

  const batch = adminDb.batch();
  activeSnap.docs.forEach((doc) => {
    batch.set(
      doc.ref,
      {
        isActive: false,
        returnedDate: new Date().toISOString().split("T")[0],
        notes: params.notes ?? null,
      },
      { merge: true },
    );
  });
  await batch.commit();
  revalidateTag(TAG_ACTIVE_ASSIGNMENTS, { expire: 0 });

  await setDeviceStatus(params.deviceId, params.newStatus); // tự revalidateTag(TAG_DEVICES) riêng
}
