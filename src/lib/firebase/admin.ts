import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

let app: App | undefined;

function getAdminApp(): App {
  if (app) return app;
  // Chỉ lấy app MẶC ĐỊNH (Firestore hpcons-itasset). Không dùng getApps()[0] vì
  // có thể tồn tại app "hpcore" (xác minh SSO) — tránh nối nhầm project.
  const existing = getApps().find((a) => a.name === "[DEFAULT]");
  if (existing) {
    app = existing;
    return app;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
  return app;
}

function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = resolve();
      const value = Reflect.get(real as object, prop);
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}

let firestoreInstance: Firestore | undefined;

function getAdminFirestore(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getAdminApp());
    // Cho phép field value undefined trong .set()/.update() (bỏ qua thay vì
    // crash) — tiện khi API route build object update từ body request có thể
    // thiếu field, giữ đúng kiểu "partial update" như Supabase .update() cũ.
    // try/catch (30/09/2026): khi 2 bundle (trang RSC + route handler) cùng nạp file này, getFirestore()
    // trả về CÙNG 1 instance đã được bundle kia gọi settings() rồi → gọi lần 2 sẽ ném lỗi 500
    // ("Firestore has already been initialized"). Lần đầu đã bật cờ rồi nên bỏ qua là đúng.
    try {
      firestoreInstance.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* đã cấu hình ở bundle khác */
    }
  }
  return firestoreInstance;
}

// Khởi tạo lười (lazy) khi được gọi thật sự, tránh build/collect-page-data
// thất bại lúc chưa có Firebase credentials thật trong .env.local.
export const adminAuth: Auth = lazyProxy(() => getAuth(getAdminApp()));
export const adminDb: Firestore = lazyProxy(getAdminFirestore);
export const adminStorage: Storage = lazyProxy(() => getStorage(getAdminApp()));
