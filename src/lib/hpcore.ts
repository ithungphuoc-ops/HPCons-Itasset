import "server-only";
import { unstable_cache } from "next/cache";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * SSO với app tổng (account.hpcore.vn).
 * ITAsset không tự đăng nhập nữa: nhận cookie phiên chung "session" (domain
 * .hpcore.vn) do app tổng phát, XÁC MINH bằng service account của project
 * hpcons-portal (env HPCORE_FIREBASE_SERVICE_ACCOUNT), lấy email rồi ánh xạ
 * sang hồ sơ quyền của ITAsset (collection profiles, khoá theo email).
 * App admin riêng tên "hpcore" — KHÔNG đụng app mặc định (Firestore hpcons-itasset).
 */

const APP_NAME = "hpcore";
export const HPCORE_LOGIN_URL = "https://account.hpcore.vn/login";
export const SSO_COOKIE_NAME = "session";

function loadCred(): object {
  const raw = process.env.HPCORE_FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Thiếu HPCORE_FIREBASE_SERVICE_ACCOUNT (service account project hpcons-portal).");
  return JSON.parse(raw);
}

function getHpcoreApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  return initializeApp({ credential: cert(loadCred() as Parameters<typeof cert>[0]) }, APP_NAME);
}

const g = globalThis as unknown as { __hpcoreAuth?: Auth; __hpcoreDb?: Firestore };
export function getHpcoreAuth(): Auth {
  return (g.__hpcoreAuth ??= getAuth(getHpcoreApp()));
}

/** Firestore của app tổng — đọc app_permissions/{uid}.itasset (vai trò do app tổng gán) */
export function getHpcoreDb(): Firestore {
  return (g.__hpcoreDb ??= getFirestore(getHpcoreApp()));
}

/** URL đăng nhập app tổng kèm đường quay lại (chỉ *.hpcore.vn) */
export function hpcoreLoginUrl(returnTo: string): string {
  return `${HPCORE_LOGIN_URL}?next=${encodeURIComponent(returnTo)}`;
}

/** Xác minh cookie phiên app tổng → { uid, email } hoặc null */
export async function verifyHpcore(cookie: string | undefined): Promise<{ uid: string; email: string } | null> {
  if (!cookie) return null;
  try {
    const d = await getHpcoreAuth().verifySessionCookie(cookie, true);
    const email = (d.email ?? "").trim().toLowerCase();
    if (!email) return null;
    return { uid: d.uid, email };
  } catch {
    return null;
  }
}

/**
 * Avatar hiện tại của người dùng, đọc TRỰC TIẾP từ Firestore app tổng
 * (users/{uid}.avatarUrl — nơi app tổng lưu avatar khi người dùng đổi ảnh đại
 * diện ở trang cá nhân account.hpcore.vn). Đọc "live" ở mỗi lần kiểm tra phiên
 * (không cache) để avatar mới đồng bộ ngay từ lần đăng nhập/tải trang kế tiếp.
 * Lỗi đọc cross-project → null, không chặn đăng nhập.
 */
// Cache 30 giây (thêm 21/08/2026, sau sự cố hết hạn mức Firestore project
// trung tâm hpcons-portal): trước đây đọc SỐNG mỗi lần xác minh phiên (mọi
// F5/chuyển trang) — nhiều lượt gọi liên tiếp của CÙNG 1 người trong 30s
// giờ chỉ tốn 1 lượt đọc thật.
export const getCentralAvatar = unstable_cache(
  async (uid: string): Promise<string | null> => {
    try {
      const snap = await getHpcoreDb().collection("users").doc(uid).get();
      const avatarUrl = snap.data()?.avatarUrl;
      return typeof avatarUrl === "string" && avatarUrl ? avatarUrl : null;
    } catch {
      return null;
    }
  },
  ["itasset-central-avatar"],
  { revalidate: 30 },
);
