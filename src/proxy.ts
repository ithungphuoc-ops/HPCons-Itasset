import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { verifyHpcore, hpcoreLoginUrl, SSO_COOKIE_NAME } from '@/lib/hpcore'
import { hpcoreAccess } from '@/lib/appAccess'
import { blockedByHpcore, effectiveRole } from '@/lib/accessRules'

export async function proxy(request: NextRequest) {
  // Lối tắt CHỈ hoạt động khi chạy `next dev` cục bộ (NODE_ENV tự động "development" — KHÔNG
  // BAO GIỜ đúng ở production build/deploy). Cookie SSO domain ".hpcore.vn" không bao giờ được
  // trình duyệt gửi tới localhost dù có đủ credentials, nên nếu không có dòng này thì local
  // luôn bị đá về trang đăng nhập thật, không cách nào thao tác thử được. Thêm 25/09/2026 theo
  // yêu cầu Sếp. Phối hợp với lối tắt tương tự ở lib/session.ts::getSession().
  if (process.env.NODE_ENV === 'development') return NextResponse.next()

  const { pathname, search, origin } = request.nextUrl

  // Xác minh phiên đăng nhập CHUNG của app tổng (cookie .hpcore.vn)
  const id = await verifyHpcore(request.cookies.get(SSO_COOKIE_NAME)?.value)
  // Phân quyền 2 tầng (23/10/2026, giống lib/session.ts::getSession): tầng 1 HPcore cấp dùng app IT
  // (owner luôn qua, là Admin) → tầng 2 vai trò ở Cài đặt → Phân quyền của app IT (profiles/{email}).
  let role: string | null = null
  let blocked = false // có vai trò trong app IT nhưng HPcore chưa cấp dùng app → báo rõ thay vì đẩy về /my-devices
  if (id) {
    const [local, access] = await Promise.all([
      adminDb.collection('profiles').doc(id.email).get().then((s) => (s.exists ? (s.data()?.role ?? null) : null)).catch(() => null),
      hpcoreAccess(id.uid),
    ])
    role = effectiveRole(access, local)
    blocked = blockedByHpcore(access, local)
  }

  const isLoggedIn = !!id
  const hasDashboardAccess = !!role
  const toHpcoreLogin = () => NextResponse.redirect(hpcoreLoginUrl(origin + pathname + search))

  // /dashboard/* — phải đăng nhập app tổng VÀ qua đủ 2 tầng
  if (pathname.startsWith('/dashboard')) {
    if (!isLoggedIn) return toHpcoreLogin()
    if (blocked) return NextResponse.redirect(new URL('/no-access', request.url))
    if (!hasDashboardAccess) return NextResponse.redirect(new URL('/my-devices', request.url))
  }

  // /my-devices — mọi người đã đăng nhập app tổng đều vào được
  if (pathname.startsWith('/my-devices') && !isLoggedIn) {
    return toHpcoreLogin()
  }

  // /login của ITAsset không còn dùng — điều hướng theo trạng thái
  if (pathname === '/login') {
    if (!isLoggedIn) return toHpcoreLogin()
    const url = request.nextUrl.clone()
    url.pathname = hasDashboardAccess ? '/dashboard' : blocked ? '/no-access' : '/my-devices'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/my-devices/:path*'],
}
