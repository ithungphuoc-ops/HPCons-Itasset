import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { adminAuth } from "@/lib/firebase/admin";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ role: null, email: null, name: null, avatar: null });

  // Bọc try/catch riêng (không chỉ .catch() ở cuối chain) — nếu Firebase Admin project mặc
  // định (hpcons-itasset) chưa có credentials trong .env.local, chính việc truy cập
  // adminAuth.getUser sẽ ném lỗi NGAY LÚC ĐỌC property (qua lazyProxy ở lib/firebase/admin.ts),
  // tức là lỗi đồng bộ xảy ra TRƯỚC khi Promise được tạo ra để .catch() có thể bắt.
  let authUser: Awaited<ReturnType<typeof adminAuth.getUser>> | null = null;
  try {
    authUser = await adminAuth.getUser(session.uid);
  } catch {
    authUser = null;
  }
  return NextResponse.json({
    role: session.profile?.role ?? null,
    email: session.email,
    name: session.profile?.fullName || authUser?.displayName || session.email,
    avatar: session.profile?.avatar ?? authUser?.photoURL ?? null,
  });
}
