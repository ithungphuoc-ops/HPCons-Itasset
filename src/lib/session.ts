import "server-only";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { verifyHpcore, getHpcoreDb, getCentralAvatar, SSO_COOKIE_NAME } from "@/lib/hpcore";
import type { FirestoreProfile, UserRole } from "@/lib/firestore/types";

// Cookie phiên do APP TỔNG phát (dùng chung *.hpcore.vn). ITAsset không tự đăng nhập.
export const SESSION_COOKIE_NAME = SSO_COOKIE_NAME; // "session"
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export interface Session {
  uid: string;   // uid app tổng (hpcons-portal)
  email: string;
  // null nếu email chưa được cấp quyền dashboard ITAsset (nhân viên thường → /my-devices)
  profile: FirestoreProfile | null;
}

/** Hồ sơ quyền ITAsset khoá theo EMAIL (vì uid app tổng khác uid cũ) */
async function profileByEmail(email: string): Promise<FirestoreProfile | null> {
  const snap = await adminDb.collection("profiles").doc(email).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as FirestoreProfile) : null;
}

/**
 * Vai trò ITAsset THẬT SỰ do app tổng gán (app_permissions/{uid}.itasset, uid
 * = uid app tổng) — nguồn quyết định duy nhất kể từ khi có trang "Quản lý ứng
 * dụng" ở app tổng. Lỗi đọc cross-project → null, rơi về hồ sơ cục bộ (không
 * chặn đăng nhập).
 *
 * Cache 30 giây (thêm 21/08/2026, sau sự cố hết hạn mức Firestore project
 * trung tâm) — trước đây đọc SỐNG mỗi lần xác minh phiên.
 */
const fetchCentralRole = unstable_cache(
  async (uid: string): Promise<UserRole | null> => {
    try {
      const snap = await getHpcoreDb().collection("app_permissions").doc(uid).get();
      const role = snap.data()?.itasset;
      return typeof role === "string" ? (role as UserRole) : null;
    } catch {
      return null;
    }
  },
  ["itasset-central-role"],
  { revalidate: 30 },
);

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const id = await verifyHpcore(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!id) return null;

  const [localProfile, centralRole, centralAvatar] = await Promise.all([
    profileByEmail(id.email),
    fetchCentralRole(id.uid),
    getCentralAvatar(id.uid),
  ]);
  // Ưu tiên avatar mới nhất từ app tổng; chỉ rơi về giá trị cục bộ (nếu có)
  // khi app tổng chưa có avatar.
  const avatar = centralAvatar ?? localProfile?.avatar ?? null;

  if (centralRole) {
    const profile: FirestoreProfile = {
      id: localProfile?.id ?? id.email,
      fullName: localProfile?.fullName ?? id.email.split("@")[0],
      role: centralRole,
      createdAt: localProfile?.createdAt ?? new Date().toISOString(),
      avatar,
    };
    return { uid: id.uid, email: id.email, profile };
  }

  // Chưa có app_permissions/{uid}.itasset — nghĩa là quyền đang đến từ panel
  // cục bộ cũ (/api/admin/users, khoá theo email, xem session.ts::profileByEmail)
  // vốn VỠ khi người này đổi email ở app tổng (sự cố 12/08/2026). Nếu đang có
  // hồ sơ cục bộ hợp lệ, TỰ ĐỘNG ghi lên app_permissions ngay lần đăng nhập
  // này để những lần sau ổn định qua UID, không cần chờ chạy migration tay.
  // Best-effort: lỗi ghi (mạng, quyền...) không chặn đăng nhập, chỉ bỏ qua.
  if (localProfile?.role) {
    try {
      await getHpcoreDb().collection("app_permissions").doc(id.uid).set(
        { itasset: localProfile.role },
        { merge: true },
      );
    } catch {
      // im lặng — vẫn cho vào bằng hồ sơ cục bộ như cũ, tự thử lại lần đăng nhập sau
    }
  }

  return {
    uid: id.uid,
    email: id.email,
    profile: localProfile ? { ...localProfile, avatar } : null,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Chưa đăng nhập");
  return session;
}

const DASHBOARD_ROLES: UserRole[] = ["admin", "it_staff", "viewer"];
const WRITE_ROLES: UserRole[] = ["admin", "it_staff"];

export function hasDashboardAccess(session: Session | null): boolean {
  return !!session?.profile && DASHBOARD_ROLES.includes(session.profile.role);
}

export function canWrite(session: Session | null): boolean {
  return !!session?.profile && WRITE_ROLES.includes(session.profile.role);
}

export function isAdmin(session: Session | null): boolean {
  return session?.profile?.role === "admin";
}

export async function requireWriteAccess(): Promise<Session> {
  const session = await requireSession();
  if (!canWrite(session)) throw new Error("Không có quyền thực hiện thao tác này");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!isAdmin(session)) throw new Error("Chỉ admin mới thực hiện được thao tác này");
  return session;
}
