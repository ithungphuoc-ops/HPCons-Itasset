'use client'
import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Monitor, Users, QrCode, Settings, LogOut } from 'lucide-react'
import { useRole } from '@/lib/hooks/useRole'
import { UserAvatar } from '@/components/UserAvatar'
import { AppLauncher } from '@/components/AppLauncher'

const navItems = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, adminOnly: false },
  { href: '/dashboard/devices', label: 'Thiết bị', icon: Monitor, adminOnly: false },
  { href: '/dashboard/employees', label: 'Nhân viên', icon: Users, adminOnly: false },
  { href: '/dashboard/scan', label: 'Quét QR', icon: QrCode, adminOnly: false },
  { href: '/dashboard/settings', label: 'Cài đặt', icon: Settings, adminOnly: true },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isAdmin, isItStaff, isViewer, name, avatar } = useRole()
  const [launcherOpen, setLauncherOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Đăng xuất chung → về trang đăng nhập app tổng
    window.location.href = 'https://account.hpcore.vn/login'
  }

  const isHandover = pathname.endsWith('/handover')

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className={`w-56 border-r border-gray-800 flex flex-col shrink-0 ${isHandover ? 'hidden' : ''}`}>
        <div className="px-5 py-5 border-b border-gray-800 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLauncherOpen(true)}
            title="Danh mục ứng dụng HP Cons"
            className="rounded-lg bg-white p-0.5 shrink-0 transition-transform hover:scale-105"
          >
            <img src="/logo.png" alt="HP Cons" className="w-7 h-7 rounded-md object-contain" />
          </button>
          <span className="font-semibold tracking-tight">ITAsset</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.filter(item => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
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

      {launcherOpen && <AppLauncher displayName={name} onClose={() => setLauncherOpen(false)} />}
    </div>
  )
}
