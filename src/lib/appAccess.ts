import "server-only";
import { getHpcoreDb } from "@/lib/hpcore";
import type { HpcoreAccess } from "@/lib/accessRules";
export type { HpcoreAccess } from "@/lib/accessRules";

// Phân quyền 2 TẦNG (Sếp chốt 23/10/2026 — giống QLK CTR / EQUI), quy tắc ở lib/accessRules.ts:
//  • Tầng 1 — HPcore: phải được cấp quyền dùng app IT ở "Quản lý ứng dụng" (app_permissions/{uid}.itasset
//    có giá trị, BẤT KỲ vai trò nào) thì mới vào được app. Owner (users/{uid}.role = "owner") luôn vào.
//  • Tầng 2 — app IT: làm được gì do trang Cài đặt → Phân quyền CỦA APP IT quyết định (profiles/{email}).
// Giá trị vai trò ghi ở HPcore KHÔNG còn quyết định quyền bên trong app — mỗi bên 1 quyền riêng.

// Cache trong bộ nhớ 30 giây / người (dùng được cả ở proxy lẫn API) — sau sự cố hết hạn mức Firestore
// app tổng 21/08/2026, không đọc sống mỗi lần chuyển trang. Lỗi đọc KHÔNG cache để lần sau thử lại.
const TTL = 30_000;
const cache = new Map<string, { v: HpcoreAccess; t: number }>();

export async function hpcoreAccess(uid: string): Promise<HpcoreAccess> {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let v: HpcoreAccess;
  try {
    const db = getHpcoreDb();
    const [perm, user] = await Promise.all([db.collection("app_permissions").doc(uid).get(), db.collection("users").doc(uid).get()]);
    const itasset = perm.data()?.itasset;
    v = user.data()?.role === "owner" ? "owner" : typeof itasset === "string" && itasset.trim() ? "granted" : "none";
  } catch {
    return "error";
  }
  if (cache.size > 1000) cache.clear();
  cache.set(uid, { v, t: Date.now() });
  return v;
}
