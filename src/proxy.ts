import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { verifyHpcore, hpcoreLoginUrl, SSO_COOKIE_NAME } from '@/lib/hpcore'

const DASHBOARD_ROLES = ['admin', 'it_staff', 'viewer']

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
  let role: string | null = null
  if (id) {
    try {
      const snap = await adminDb.collection('profiles').doc(id.email).get()
      role = snap.exists ? (snap.data()?.role ?? null) : null
    } catch {
      role = null
    }
  }

  const isLoggedIn = !!id
  const hasDashboardAccess = !!role && DASHBOARD_ROLES.includes(role)
  const toHpcoreLogin = () => NextResponse.redirect(hpcoreLoginUrl(origin + pathname + search))

  // /dashboard/* — phải đăng nhập app tổng VÀ có quyền dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!isLoggedIn) return toHpcoreLogin()
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
    url.pathname = hasDashboardAccess ? '/dashboard' : '/my-devices'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/my-devices/:path*'],
}
