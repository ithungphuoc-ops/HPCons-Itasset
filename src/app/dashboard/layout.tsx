'use client'
import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Monitor, Users, QrCode, Settings, LogOut, Gift, ClipboardCheck, ArrowLeft, Warehouse, Paintbrush } from 'lucide-react'
import { useRole } from '@/lib/hooks/useRole'
import { UserAvatar } from '@/components/UserAvatar'
import { AppLauncher } from '@/components/AppLauncher'
import GiftPopup from '@/components/GiftPopup'
import { APP_NAME, KHO_LIST } from '@/lib/kho/config'

// Menu Kho IT (Kho Tổng, 30/09/2026). Trang /dashboard = danh sách kho; vào 1 kho thì menu đổi theo kho đó.
const navItems = [
  { href: '/dashboard/it', label: 'Tổng quan', icon: LayoutDashboard, adminOnly: false },
  { href: '/dashboard/tasks', label: 'Công việc', icon: ClipboardCheck, adminOnly: false },
  { href: '/dashboard/devices', label: 'Thiết bị', icon: Monitor, adminOnly: false },
  { href: '/dashboard/employees', label: 'Nhân viên', icon: Users, adminOnly: false },
  { href: '/dashboard/scan', label: 'Quét QR', icon: QrCode, adminOnly: false },
  { href: '/dashboard/settings', label: 'Cài đặt', icon: Settings, adminOnly: true },
  // Đợt 2 (01/10/2026): Admin tự sửa Loại, thông số, trường, cột, tình trạng, ô Tổng quan, mẫu phiếu in
  { href: '/dashboard/giao-dien', label: 'Sửa giao diện', icon: Paintbrush, adminOnly: true },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isAdmin, isItStaff, isViewer, name, avatar } = useRole()
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [giftOpen, setGiftOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Đăng xuất chung → về trang đăng nhập app tổng
    window.location.href = 'https://account.hpcore.vn/login'
  }

  // Trang danh sách kho (và các kho chưa làm) → menu hiện các kho; còn lại là menu Kho IT
  const inKhoList = pathname === '/dashboard' || pathname.startsWith('/dashboard/kho/')

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-800 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLauncherOpen(true)}
            title="Danh mục ứng dụng HP Cons"
            className="rounded-lg bg-white p-0.5 shrink-0 transition-transform hover:scale-105"
          >
            <img src="/logo.png" alt="HP Cons" className="w-7 h-7 rounded-md object-contain" />
          </button>
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => setGiftOpen(true)}
            title="Quà của tôi"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:bg-amber-400"
          >
            <Gift size={18} />
            {/* Số điểm tạm để 0 — chưa nối UrBox thật, xem hpcons-quacuatoi/openspec */}
            <span>0 điểm</span>
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {inKhoList ? (
            <>
              <Link href="/dashboard" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${pathname === '/dashboard' ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <Warehouse size={16} /> Tất cả kho
              </Link>
              {KHO_LIST.map((k) => (
                <Link key={k.slug} href={k.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${pathname.startsWith(k.href) ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: k.color }} /> {k.name}
                </Link>
              ))}
            </>
          ) : (
            <>
              <Link href="/dashboard" className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-white">
                <ArrowLeft size={13} /> {APP_NAME}
              </Link>
              <div className="flex items-center gap-2 px-3 pb-2 text-sm font-semibold text-white">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: KHO_LIST[0].color }} /> {KHO_LIST[0].name}
              </div>
              {navItems.filter(item => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== '/dashboard/it' && pathname.startsWith(href))
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                    <Icon size={16} />
                    {label}
                  </Link>
                )
              })}
            </>
          )}
        </nav>
        {/* Tài khoản đang đăng nhập */}
        <div className="px-4 py-3 border-t border-gray-800/50 flex items-center gap-2.5">
          <UserAvatar avatar={avatar} name={name} size={28} />
          <div className="min-w-0">
            {name && <p className="text-xs text-gray-300 truncate leading-tight">{name}</p>}
            <span className={`text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${isAdmin ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
              {isAdmin ? 'Admin' : isItStaff ? 'IT Staff' : isViewer ? 'Chỉ xem' : ''}
            </span>
          </div>
        </div>
        <div className="px-3 py-4 border-t border-gray-800">
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 w-full transition-colors">
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Nút "Quà của tôi" nổi riêng cho màn hình hẹp — thiếu sót phát hiện 22/08/2026: sidebar
          của app này chưa hề có xử lý responsive nào cho di động (không ẩn/thu gọn ở bất kỳ
          breakpoint nào), nên trên điện thoại thật sidebar bị bóp méo và nút Quà của tôi bên
          trong gần như không bấm được. Đây là nút nổi ĐỘC LẬP, không đụng vào sidebar hiện có để
          tránh làm hỏng thêm phần điều hướng đang chạy — xử lý responsive toàn diện cho sidebar
          là việc lớn hơn, cần làm riêng nếu Sếp muốn.
      */}
      <button
        type="button"
        onClick={() => setGiftOpen(true)}
        title="Quà của tôi"
        className="md:hidden fixed top-4 right-4 z-30 w-11 h-11 rounded-full bg-amber-500 text-gray-900 shadow-lg flex items-center justify-center"
      >
        <Gift size={20} />
      </button>

      {launcherOpen && <AppLauncher displayName={name} onClose={() => setLauncherOpen(false)} />}
      {giftOpen && <GiftPopup onClose={() => setGiftOpen(false)} />}
    </div>
  )
}
