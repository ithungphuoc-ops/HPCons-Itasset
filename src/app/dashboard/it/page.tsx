'use client'
// Tổng quan Kho IT — 6 ô số liệu theo thiết kế Sếp (TỰ ĐẾM từ dữ liệu, bấm vào mở đúng danh sách
// đã lọc) + theo loại + phiếu gần đây.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package, CheckCircle, Archive, XCircle, Users, ClipboardCheck, ArrowRight } from 'lucide-react'
import { CATEGORY_LABEL, CATEGORY_ORDER, MOVE_DEFS, fmtDate } from '@/lib/kho/config'
import type { FirestoreMove } from '@/lib/firestore/types'

interface Stats {
  total: number; in_use: number; in_stock: number; broken: number; employees: number
  tasks: number; tasks_total: number; units_left: number; by_category: Record<string, number>
}

const MOVE_COLOR: Record<string, string> = { NK: 'text-green-400', XK: 'text-blue-400', TH: 'text-orange-400', LC: 'text-purple-400' }

export default function KhoITOverview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<FirestoreMove[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then((j) => { setStats(j.stats || null); setRecent(j.recent || []); setLoading(false) })
  }, [])

  const v = (n?: number) => (loading ? '—' : String(n ?? 0))
  const tiles = [
    { label: 'Tổng thiết bị', value: v(stats?.total), icon: Package, color: 'text-blue-400', bg: 'bg-blue-400/10', href: '/dashboard/devices', sub: loading ? '' : `${stats?.units_left ?? 0} cái đang trong kho` },
    { label: 'Đang sử dụng', value: v(stats?.in_use), icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10', href: '/dashboard/devices?status=in_use' },
    { label: 'Trong kho', value: v(stats?.in_stock), icon: Archive, color: 'text-purple-400', bg: 'bg-purple-400/10', href: '/dashboard/devices?status=in_stock' },
    { label: 'Hỏng', value: v(stats?.broken), icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', href: '/dashboard/devices?status=broken' },
    { label: 'Nhân viên', value: v(stats?.employees), icon: Users, color: 'text-orange-400', bg: 'bg-orange-400/10', href: '/dashboard/employees' },
    { label: 'Công việc', value: v(stats?.tasks), icon: ClipboardCheck, color: 'text-cyan-400', bg: 'bg-cyan-400/10', href: '/dashboard/tasks', sub: loading ? '' : `chưa xong / ${stats?.tasks_total ?? 0} việc` },
  ]

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-gray-400 text-sm mt-1">Kho IT · thiết bị CNTT, cấp phát, công việc IT</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {tiles.map(({ label, value, icon: Icon, color, bg, href, sub }) => (
          <Link key={label} href={href} className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-colors group">
            <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center mb-3`}><Icon className={color} size={20} /></div>
            <div className="text-2xl font-bold mb-0.5">{value}</div>
            <div className="text-sm text-gray-400 group-hover:text-gray-300">{label}</div>
            {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Theo loại thiết bị</div>
          <div className="space-y-2">
            {CATEGORY_ORDER.filter((c) => (stats?.by_category?.[c] ?? 0) > 0).map((c) => (
              <Link key={c} href={`/dashboard/devices?category=${c}`} className="flex items-center gap-3 group">
                <span className="text-sm text-gray-400 flex-1 group-hover:text-white">{CATEGORY_LABEL[c]}</span>
                <span className="text-sm font-semibold">{stats?.by_category[c]}</span>
              </Link>
            ))}
            {!loading && !Object.values(stats?.by_category || {}).some(Boolean) && <p className="text-xs text-gray-600">Chưa có dữ liệu</p>}
          </div>
        </div>

        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold">Phiếu gần đây</h2>
            <Link href="/dashboard/devices" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">Tới Thiết bị <ArrowRight size={14} /></Link>
          </div>
          {loading ? <div className="px-5 py-8 text-center text-gray-500 text-sm">Đang tải...</div>
            : !recent.length ? <div className="px-5 py-8 text-center text-gray-500 text-sm">Chưa có phiếu nào</div>
            : (
              <div className="divide-y divide-gray-800/50">
                {recent.map((m) => (
                  <Link key={m.id} href={`/dashboard/devices/${m.lines[0]?.deviceId}`} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-800/40">
                    <span className={`text-xs font-medium w-20 shrink-0 ${MOVE_COLOR[m.type]}`}>{MOVE_DEFS[m.type].label}</span>
                    <span className="font-mono text-xs text-gray-400 w-24 shrink-0">{m.so || 'dữ liệu cũ'}</span>
                    <span className="flex-1 min-w-0 text-sm truncate">
                      {m.lines.map((l) => l.assetCode).join(', ')}
                      <span className="text-gray-500"> · {m.type === 'NK' ? m.info.ncc : m.type === 'LC' ? `${m.info.nguoi} → ${m.info.nguoi2}` : m.info.nguoi}</span>
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">{fmtDate(m.date)}</span>
                  </Link>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
