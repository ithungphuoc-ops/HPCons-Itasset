'use client'

// AppLauncher — danh sách ứng dụng công ty (giống hệt DauThau/Task Manager/PKD),
// lấy từ account.hpcore.vn/api/apps. Bấm vào logo ở đầu Sidebar để mở.
import { useEffect, useState } from 'react'
import HighlightMatch, { normalizeSearch } from '@/components/HighlightMatch'
import {
  Clock, MapPin, FileCheck, Send, CalendarClock, BarChart3, Settings,
  Warehouse, Briefcase, Receipt, Workflow, Heart, Laptop, PenTool, ClipboardCheck,
  Gavel, LayoutGrid, Search, X, AppWindow, type LucideIcon,
} from 'lucide-react'

const APPS_API = 'https://account.hpcore.vn/api/apps'
const HPCORE_DASHBOARD_URL = 'https://account.hpcore.vn/dashboard'
const HPCORE_PROFILE_URL = 'https://account.hpcore.vn/profile'
const CURRENT_APP_HOST = 'itasset.hpcore.vn'

const ICONS: Record<string, LucideIcon> = {
  Clock, MapPin, FileCheck, Send, CalendarClock, BarChart3, Settings,
  Warehouse, Briefcase, Receipt, Workflow, Heart, Laptop, PenTool, ClipboardCheck, Gavel,
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
        className={`flex size-14 items-center justify-center overflow-hidden rounded-xl transition-transform group-hover:scale-105
        ${app.image ? 'bg-white' : (app.color ?? 'bg-blue-600')} ${app.comingSoon ? 'opacity-50' : ''}`}
      >
        {app.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.image} alt={app.name} className="size-full scale-[1.15] object-cover" />
        ) : (
          <Icon className="size-6 text-white" aria-hidden />
        )}
      </div>
      <span className={`text-center text-xs font-medium leading-tight ${app.comingSoon ? 'text-gray-500' : 'text-gray-200'}`}>
        <HighlightMatch text={app.name} query={query} />
      </span>
      {current && <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] text-blue-400">Đang dùng</span>}
      {app.comingSoon && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-400">Sắp ra mắt</span>}
    </>
  )
  const cls = 'group flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-gray-800'
  if (app.comingSoon || !app.href) return <div className={`${cls} cursor-default`} title="Sắp ra mắt">{inner}</div>
  if (current) return <div className={cls}>{inner}</div>
  return <a href={app.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={cls}>{inner}</a>
}

export function AppLauncher({ displayName, onClose }: { displayName?: string | null; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [apps, setApps] = useState<RemoteApp[] | null>(null)

  useEffect(() => {
    let ok = true
    fetch(APPS_API)
      .then((r) => r.json())
      .then((d) => { if (ok) setApps(Array.isArray(d.apps) ? d.apps : []) })
      .catch(() => { if (ok) setApps([]) })
    return () => { ok = false }
  }, [])

  const ql = normalizeSearch(q.trim())
  const list = (apps ?? []).filter((a) => !ql || normalizeSearch(a.name).includes(ql))
  const groups = [
    { title: 'Nhân sự & Vận hành', subtitle: 'Chấm công, đơn từ, đặt phòng, báo cáo...', apps: list.filter((a) => a.category !== 'business') },
    { title: 'Ứng dụng nghiệp vụ', subtitle: 'Kinh doanh, kho, tài sản, quy trình...', apps: list.filter((a) => a.category === 'business') },
  ].filter((g) => g.apps.length > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-start overflow-y-auto bg-black/60 p-3 sm:py-4 sm:pl-[248px] sm:pr-4"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl rounded-xl border border-gray-800 bg-gray-900 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-3 border-b border-gray-800 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="truncate font-bold">{displayName || 'Người dùng'}</p>
            <a href={HPCORE_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">Tài khoản</a>
          </div>
          <div className="relative sm:ml-auto sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder="Tìm kiếm ứng dụng"
              className="h-9 w-full rounded-md border border-gray-700 bg-gray-950 pl-9 pr-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button onClick={onClose} aria-label="Đóng" className="hidden size-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-800 sm:flex">
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto p-5">
          <a href={HPCORE_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:underline">
            <LayoutGrid className="size-4" /> Tổng quan HPCons App Tổng
          </a>

          {apps === null ? (
            <p className="py-8 text-center text-sm text-gray-500">Đang tải danh sách ứng dụng…</p>
          ) : groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Không có ứng dụng phù hợp</p>
          ) : (
            groups.map((g) => (
              <div key={g.title}>
                <p className="font-semibold">{g.title}</p>
                <p className="mb-3 text-xs text-gray-500">{g.subtitle}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
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
