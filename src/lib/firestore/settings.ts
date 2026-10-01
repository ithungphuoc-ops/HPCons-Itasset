import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeSettings, type KhoSettings } from "@/lib/kho/settings";

// Cấu hình "Sửa giao diện" Kho IT — 1 document duy nhất, cache 60s (mọi trang + API đọc chung →
// gần như không tốn lượt đọc). Ghi xong revalidateTag để thấy ngay.
const ref = () => adminDb.collection("settings").doc("kho_it");
export const TAG_KHO_SETTINGS = "itasset-kho-settings";

export const getKhoSettings = unstable_cache(
  async (): Promise<KhoSettings> => {
    const snap = await ref().get();
    return normalizeSettings(snap.exists ? snap.data() : null);
  },
  ["itasset-kho-settings"],
  { revalidate: 60, tags: [TAG_KHO_SETTINGS] },
);

export async function saveKhoSettings(s: KhoSettings, by: string | null): Promise<KhoSettings> {
  const clean = normalizeSettings({ ...s, updatedAt: new Date().toISOString(), updatedBy: by });
  // set KHÔNG merge: lưu nguyên bản đã chuẩn hoá (xoá mục = xoá thật, không bị giữ lại do merge sâu)
  await ref().set(clean);
  revalidateTag(TAG_KHO_SETTINGS, { expire: 0 });
  return clean;
}
