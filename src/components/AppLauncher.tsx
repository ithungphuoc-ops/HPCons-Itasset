'use client'

// AppLauncher — danh sách ứng dụng công ty, CHUẨN thị giác theo app tổng
// (hpcons-portal components/layout/AppLauncher.tsx): panel TRẮNG kể cả app
// nền tối, header avatar 44px + dòng link "Về App Tổng · Tài khoản · Đăng xuất".
// Danh sách lấy sống từ account.hpcore.vn/api/apps. Bấm logo đầu Sidebar để mở.
import {

/* Safelist mau tile tu API app tong (Tailwind chi compile class xuat hien
   trong source — thieu la tile mat mau nen, icon trang vo hinh):
   bg-amber-500 bg-blue-500 bg-cyan-500 bg-emerald-500 bg-fuchsia-500 bg-gray-500 bg-green-500 bg-indigo-500 bg-lime-500 bg-orange-500 bg-orange-600 bg-pink-500 bg-purple-500 bg-red-500 bg-rose-500 bg-sky-500 bg-slate-500 bg-teal-500 bg-violet-500 bg-yellow-500 */
 useEffect, useState } from 'react'
import HighlightMatch, { normalizeSearch } from '@/components/HighlightMatch'
import { UserAvatar } from '@/components/UserAvatar'
import { useRole } from '@/lib/hooks/useRole'
import {
  Clock, MapPin, FileCheck, Send, CalendarClock, BarChart3, Settings,
  Warehouse, Briefcase, Receipt, Workflow, Heart, Laptop, PenTool, ClipboardCheck,
  Gavel, Gift, Boxes, Handshake, ListChecks, Package,
  Search, X, AppWindow, type LucideIcon,
} from 'lucide-react'

const APPS_API = 'https://account.hpcore.vn/api/apps'
const HPCORE_DASHBOARD_URL = 'https://account.hpcore.vn/dashboard'
const HPCORE_PROFILE_URL = 'https://account.hpcore.vn/profile'
const CURRENT_APP_HOST = 'itasset.hpcore.vn'

// Đối chiếu đủ bảng ICONS trong lib/dashboardApps.ts của app tổng
// (trước đây thiếu Gift, Boxes, Handshake, ListChecks, Package → app mới rơi về AppWindow).
const ICONS: Record<string, LucideIcon> = {
  Clock, MapPin, FileCheck, Send, CalendarClock, BarChart3, Settings,
  Warehouse, Briefcase, Receipt, Workflow, Heart, Laptop, PenTool, ClipboardCheck,
  Gavel, Gift, Boxes, Handshake, ListChecks, Package,
}

type RemoteApp = {
  name: string
  description?: string
  iconKey?: string
  color?: string
  category?: 'ops' | 'business'
  image?: string | null
  href?: string | null
  comingSoon?: boolean
}


function Tile({ app, onNavigate, query }: { app: RemoteApp; onNavigate: () => void; query: string }) {
  const Icon = (app.iconKey && ICONS[app.iconKey]) || AppWindow
  const current = !!app.href && app.href.includes(CURRENT_APP_HOST)
  const inner = (
    <>
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105
        ${app.image ? 'bg-white border border-gray-100' : (app.color ?? 'bg-blue-600')} ${app.comingSoon ? 'opacity-50' : ''}`}
      >
        {app.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.image} alt={app.name} className="w-full h-full object-cover scale-[1.15]" />
        ) : (
          <Icon size={26} className="text-white" aria-hidden />
        )}
      </div>
      <p className={`text-xs font-medium text-center leading-tight ${app.comingSoon ? 'text-gray-400' : 'text-gray-700'}`}>
        <HighlightMatch text={app.name} query={query} />
      </p>
      {current && <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">Đang dùng</span>}
      {app.comingSoon && <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Sắp ra mắt</span>}
    </>
  )
  const cls = 'group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors'
  if (app.comingSoon || !app.href) return <div className={`${cls} cursor-default`} title="Sắp ra mắt">{inner}</div>
  if (current) return <div className={cls}>{inner}</div>
  return <a href={app.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={cls}>{inner}</a>
}

export function AppLauncher({ displayName, onClose }: { displayName?: string | null; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [apps, setApps] = useState<RemoteApp[] | null>(null)
  // Avatar thật đồng bộ từ app tổng (giống Sidebar) — launcher không nhận prop này.
  const { avatar } = useRole()

  useEffect(() => {
    let ok = true
    fetch(APPS_API)
      .then((r) => r.json())
      .then((d) => { if (ok) setApps(Array.isArray(d.apps) ? d.apps : []) })
      .catch(() => { if (ok) setApps([]) })
    return () => { ok = false }
  }, [])

  // Đăng xuất giữ đúng logic sẵn có của app (dashboard/layout.tsx).
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = 'https://account.hpcore.vn/login'
  }

  const ql = normalizeSearch(q.trim())
  const list = (apps ?? []).filter((a) => !ql || normalizeSearch(a.name).includes(ql))
  const groups = [
    { title: 'Nhân sự & Vận hành', subtitle: 'Chấm công, đơn từ, đặt phòng, báo cáo...', apps: list.filter((a) => a.category !== 'business') },
    { title: 'Ứng dụng nghiệp vụ', subtitle: 'Kinh doanh, kho, tài sản, quy trình...', apps: list.filter((a) => a.category === 'business') },
  ].filter((g) => g.apps.length > 0)

  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-start p-3 sm:py-4 sm:pl-[248px] sm:pr-4 overflow-y-auto"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            {avatar ? (
              <UserAvatar avatar={avatar} name={displayName} size={44} />
            ) : (
              // Fallback chuẩn app tổng: vòng tròn chữ nền màu thương hiệu
              <div
                className="rounded-full flex items-center justify-center font-medium text-white shrink-0"
                style={{ width: 44, height: 44, fontSize: 18, background: 'var(--hp-primary, #096AA7)' }}
              >
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{displayName || 'Người dùng'}</p>
              <p className="text-xs text-gray-400">
                {(apps ?? []).length} ứng dụng ·{' '}
                <a href={HPCORE_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Về App Tổng</a> ·{' '}
                <a href={HPCORE_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Tài khoản</a> ·{' '}
                <button onClick={handleLogout} className="text-blue-600 hover:underline">Đăng xuất</button>
              </p>
            </div>
          </div>
          <div className="relative sm:ml-auto sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder="Tìm kiếm ứng dụng"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={onClose} aria-label="Đóng" className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {/* Nhóm ứng dụng */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-7">
          {apps === null ? (
            <p className="text-center text-gray-400 py-10">Đang tải danh sách ứng dụng…</p>
          ) : groups.length === 0 ? (
            <p className="text-center text-gray-400 py-10">Không tìm thấy ứng dụng phù hợp</p>
          ) : (
            groups.map((g) => (
              <div key={g.title}>
                <p className="font-semibold text-gray-800">{g.title}</p>
                <p className="text-xs text-gray-400 mb-3">{g.subtitle}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {g.apps.map((app) => <Tile key={app.name} app={app} onNavigate={onClose} query={ql} />)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
