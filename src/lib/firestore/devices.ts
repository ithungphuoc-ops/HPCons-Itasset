import "server-only";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import type { FirestoreDevice, LaptopSpecs, MonitorSpecs } from "@/lib/firestore/types";

const collection = () => adminDb.collection("devices");

// Chuyển document Firestore (camelCase) sang shape JSON cũ (snake_case) mà
// frontend đang tiêu thụ, để không phải sửa phía client.
export function toDeviceJson(device: FirestoreDevice) {
  return {
    id: device.id,
    asset_code: device.assetCode,
    category: device.category,
    brand: device.brand,
    model: device.model,
    serial_number: device.serialNumber,
    status: device.status,
    purchase_date: device.purchaseDate,
    purchase_price: device.purchasePrice,
    warranty_expiry: device.warrantyExpiry,
    notes: device.notes,
    image_url: device.imageUrl,
    qr_code: device.qrCode,
    quantity: device.quantity,
    created_at: device.createdAt,
    updated_at: device.updatedAt,
    laptop_specs: device.laptopSpecs
      ? { ...device.laptopSpecs, main_board: device.laptopSpecs.mainBoard, power_supply: device.laptopSpecs.powerSupply }
      : null,
    monitor_specs: device.monitorSpecs,
  };
}

function fromDoc(doc: FirebaseFirestore.DocumentSnapshot): FirestoreDevice {
  return { id: doc.id, ...doc.data() } as FirestoreDevice;
}

// ⚠️ Xem quy ước hạn mức Firestore đầy đủ ở đầu lib/firestore/departments.ts. Chỉ cache
// `listAllDevices()` — KHÔNG đổi `getDeviceById()` sang đọc từ list đã cache dù cùng dạng N+1,
// vì `updateDevice()` bên dưới dùng `getDeviceById()` để đọc-sửa-đổi (merge laptopSpecs/
// monitorSpecs) — nếu tra từ cache có thể merge nhầm dữ liệu CŨ (trước lần sửa gần nhất trong
// vòng cache 30s), làm mất bản cập nhật ngay trước đó. `getDeviceById()` phải luôn đọc SỐNG.
export const listAllDevices = unstable_cache(
  async (): Promise<FirestoreDevice[]> => {
    const snap = await collection().orderBy("assetCode").get();
    return snap.docs.map(fromDoc);
  },
  ["itasset-devices"],
  { revalidate: 30 },
);

export async function getDeviceById(id: string): Promise<FirestoreDevice | null> {
  const doc = await collection().doc(id).get();
  return doc.exists ? fromDoc(doc) : null;
}

export async function findDeviceByAssetCode(assetCode: string): Promise<FirestoreDevice | null> {
  const snap = await collection().where("assetCode", "==", assetCode).limit(1).get();
  return snap.empty ? null : fromDoc(snap.docs[0]);
}

export async function findDeviceByQrCode(qrCode: string): Promise<FirestoreDevice | null> {
  const snap = await collection().where("qrCode", "==", qrCode).limit(1).get();
  return snap.empty ? null : fromDoc(snap.docs[0]);
}

export interface CreateDeviceInput {
  assetCode: string;
  category: FirestoreDevice["category"];
  brand: string;
  model: string;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  status?: FirestoreDevice["status"];
  quantity?: number;
  laptopSpecs?: LaptopSpecs | null;
  monitorSpecs?: MonitorSpecs | null;
}

export async function createDevice(input: CreateDeviceInput): Promise<FirestoreDevice> {
  const now = new Date().toISOString();
  const qrCode = `ITASSET-${input.assetCode}-${Date.now()}`;
  const device: Omit<FirestoreDevice, "id"> = {
    assetCode: input.assetCode,
    category: input.category,
    brand: input.brand,
    model: input.model,
    serialNumber: input.serialNumber ?? null,
    status: input.status ?? "in_stock",
    purchaseDate: input.purchaseDate ?? null,
    purchasePrice: input.purchasePrice ?? null,
    warrantyExpiry: input.warrantyExpiry ?? null,
    notes: input.notes ?? null,
    imageUrl: null,
    qrCode,
    quantity: input.quantity ?? 1,
    createdAt: now,
    updatedAt: now,
    laptopSpecs: input.laptopSpecs ?? null,
    monitorSpecs: input.monitorSpecs ?? null,
  };
  const ref = await collection().add(device);
  return { id: ref.id, ...device };
}

export interface UpdateDeviceInput {
  category?: FirestoreDevice["category"];
  brand?: string;
  model?: string;
  serialNumber?: string | null;
  status?: FirestoreDevice["status"];
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
  quantity?: number;
  laptopSpecs?: Partial<LaptopSpecs>;
  monitorSpecs?: Partial<MonitorSpecs>;
}

export async function updateDevice(id: string, input: UpdateDeviceInput): Promise<void> {
  const { laptopSpecs, monitorSpecs, ...rest } = input;
  const update: Record<string, unknown> = { ...rest, updatedAt: new Date().toISOString() };

  if (laptopSpecs || monitorSpecs) {
    const current = await getDeviceById(id);
    if (laptopSpecs) update.laptopSpecs = { ...(current?.laptopSpecs ?? {}), ...laptopSpecs };
    if (monitorSpecs) update.monitorSpecs = { ...(current?.monitorSpecs ?? {}), ...monitorSpecs };
  }

  await collection().doc(id).set(update, { merge: true });
}

export async function setDeviceStatus(id: string, status: FirestoreDevice["status"]): Promise<void> {
  await collection().doc(id).set({ status, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteDevice(id: string): Promise<void> {
  await collection().doc(id).delete();
}
