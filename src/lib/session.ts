import "server-only";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import { verifyHpcore, getCentralAvatar, SSO_COOKIE_NAME } from "@/lib/hpcore";
import { hpcoreAccess } from "@/lib/appAccess";
import { effectiveRole, type HpcoreAccess } from "@/lib/accessRules";
import type { FirestoreProfile, UserRole } from "@/lib/firestore/types";

// Cookie phiên do APP TỔNG phát (dùng chung *.hpcore.vn). ITAsset không tự đăng nhập.
export const SESSION_COOKIE_NAME = SSO_COOKIE_NAME; // "session"
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export interface Session {
  uid: string;   // uid app tổng (hpcons-portal)
  email: string;
  // null nếu email chưa được cấp quyền dashboard ITAsset (nhân viên thường → /my-devices)
  profile: FirestoreProfile | null;
  // Tầng 1: đã được cấp dùng app IT ở HPcore chưa (xem lib/appAccess.ts)
  hpcore: HpcoreAccess;
}

/** Hồ sơ quyền ITAsset khoá theo EMAIL (vì uid app tổng khác uid cũ) */
async function profileByEmail(email: string): Promise<FirestoreProfile | null> {
  const snap = await adminDb.collection("profiles").doc(email).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as FirestoreProfile) : null;
}


// Lối tắt CHỈ hoạt động khi chạy `next dev` cục bộ (NODE_ENV tự động là "development" —
// KHÔNG BAO GIỜ đúng ở production build/deploy, Vercel luôn build với NODE_ENV=production).
// Cookie phiên SSO domain ".hpcore.vn" không bao giờ được trình duyệt gửi tới localhost dù có
// đủ credentials — đây là giới hạn của trình duyệt, không phải thiếu cấu hình — nên không cách
// nào đăng nhập thật ở local. Thêm 25/09/2026 theo yêu cầu Sếp muốn thao tác thử toàn bộ
// dashboard ở local. Giả lập vai trò admin để xem được mọi trang (kể cả trang chỉ-admin).
// Thử vai trò khác ở local: bật dev server với ITASSET_DEV_ROLE=it_staff | viewer | none (23/10/2026).
function localDevSession(): Session {
  const r = process.env.ITASSET_DEV_ROLE;
  const role = r === "it_staff" || r === "viewer" ? r : "admin";
  return {
    uid: "local-dev",
    email: "dev@local",
    profile: r === "none" ? null : { id: "dev@local", fullName: "Dev cục bộ (giả lập)", role, createdAt: new Date().toISOString(), avatar: null },
    hpcore: "granted",
  };
}

export async function getSession(): Promise<Session | null> {
  if (process.env.NODE_ENV === "development") return localDevSession();

  const cookieStore = await cookies();
  const id = await verifyHpcore(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!id) return null;

  const [localProfile, hpcore, centralAvatar] = await Promise.all([
    profileByEmail(id.email),
    hpcoreAccess(id.uid),
    getCentralAvatar(id.uid),
  ]);
  // Ưu tiên avatar mới nhất từ app tổng; chỉ rơi về giá trị cục bộ (nếu có)
  // khi app tổng chưa có avatar.
  const avatar = centralAvatar ?? localProfile?.avatar ?? null;

  // Phân quyền 2 tầng (23/10/2026, xem lib/appAccess.ts): owner luôn là Admin; người khác phải QUA tầng
  // HPcore (được cấp dùng app IT) rồi vai trò lấy từ Cài đặt → Phân quyền của app IT (profiles/{email}).
  // Chưa qua tầng HPcore → không có vai trò dashboard (như nhân viên thường). KHÔNG còn ghi chép vai trò
  // sang app_permissions (trước đây gây lệch: đổi vai trò trong app IT mà HPcore vẫn giữ vai trò cũ).
  const role = effectiveRole(hpcore, localProfile?.role) as UserRole | null;
  const profile: FirestoreProfile | null = role
    ? {
        ...(localProfile ?? {}),
        id: localProfile?.id ?? id.email,
        fullName: localProfile?.fullName ?? id.email.split("@")[0],
        role,
        createdAt: localProfile?.createdAt ?? new Date().toISOString(),
        avatar,
      }
    : null;
  return { uid: id.uid, email: id.email, profile, hpcore };
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
