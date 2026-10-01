'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search, User, Building2, QrCode, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Employee } from '@/lib/types'
import { useRole } from '@/lib/hooks/useRole'

function normalizeVi(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D').toLowerCase()
}

interface SyncMeta { syncedAt: string; by: string | null; hpcoreUsers: number; created: number; updated: number; deactivated: number }

export default function EmployeesPage() {
  const { isAdmin } = useRole()
  const [sync, setSync] = useState<SyncMeta | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const router = useRouter()
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [reload, setReload] = useState(0)
  useEffect(() => {
    fetch('/api/employees')
      .then(r => r.json())
      .then(json => { setAllEmployees((json.data as Employee[]) || []); setSync(json.sync || null); setLoading(false) })
  }, [reload])

  async function syncNow() {
    setSyncing(true); setSyncMsg('')
    const res = await fetch('/api/employees/sync', { method: 'POST' })
    const json = await res.json()
    setSyncing(false)
    if (!res.ok) { setSyncMsg(json.error || 'Không đồng bộ được'); return }
    const r = json.data as SyncMeta
    setSyncMsg(`Đã đồng bộ ${r.hpcoreUsers} người từ HPcore: thêm ${r.created}, cập nhật ${r.updated}, ngưng ${r.deactivated}`)
    setReload((n) => n + 1)
  }

  const employees = useMemo(() => {
    if (!search.trim()) return allEmployees
    const q = normalizeVi(search)
    return allEmployees.filter(e =>
      normalizeVi(e.full_name).includes(q) ||
      normalizeVi(e.employee_code || '').includes(q) ||
      normalizeVi((e.department as { name: string } | undefined)?.name || '').includes(q)
    )
  }, [allEmployees, search])

  const grouped = employees.reduce<Record<string, Employee[]>>((acc, emp) => {
    const dept = (emp.department as { name: string } | undefined)?.name || 'Chưa phân phòng ban'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(emp)
    return acc
  }, {})

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    setSelected(prev => prev.size === employees.length ? new Set() : new Set(employees.map(e => e.id)))
  }
  function handlePrintQR() {
    const ids = Array.from(selected).join(',')
    router.push(`/dashboard/employees/print-qr?ids=${ids}`)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Nhân viên</h1>
          <p className="text-gray-400 text-sm mt-1">
            {loading ? '...' : `${employees.length} nhân viên · ${Object.keys(grouped).length} phòng ban`}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Đợt 3: Nhân viên lấy từ App Tổng HPcore — không thêm / import tay nữa */}
          {isAdmin && (
            <button onClick={syncNow} disabled={syncing}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
            </button>
          )}
        </div>
      </div>
      <div className="mb-5 text-sm bg-blue-500/10 border border-blue-500/30 text-blue-200 rounded-xl px-4 py-3">
        Danh sách lấy từ <b>App Tổng HPcore</b> (họ tên, email, phòng ban do HPcore quản — sửa ở account.hpcore.vn). Tự đồng bộ mỗi ngày 1 lần
        {sync ? <> · lần cuối {new Date(sync.syncedAt).toLocaleString('vi-VN')} ({sync.hpcoreUsers} người)</> : <> · chưa đồng bộ lần nào</>}.
        {syncMsg && <div className="mt-1 text-white">{syncMsg}</div>}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Tìm tên, mã NV, phòng ban... (không cần dấu)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Action bar khi có chọn */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-blue-600/10 border border-blue-500/30 rounded-xl">
          <span className="text-sm text-blue-300 flex-1">Đã chọn <strong>{selected.size}</strong> nhân viên</span>
          <button onClick={handlePrintQR}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <QrCode size={15} /> In QR ({selected.size})
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 px-3 py-2 rounded-lg transition-colors">
            Bỏ chọn
          </button>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-900 rounded-lg animate-pulse" />)}
        </div>
      )}

      {!loading && employees.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <User size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Không tìm thấy nhân viên nào</p>
        </div>
      )}

      {!loading && employees.length > 0 && (
        <div className="space-y-6">
          {search ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-left">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox"
                        checked={employees.length > 0 && selected.size === employees.length}
                        onChange={toggleAll}
                        className="rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer" />
                    </th>
                    <th className="px-4 py-3 font-medium">Nhân viên</th>
                    <th className="px-4 py-3 font-medium">Mã NV</th>
                    <th className="px-4 py-3 font-medium">Phòng ban</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <EmployeeRow key={emp.id} emp={emp}
                      selected={selected.has(emp.id)} onToggle={() => toggleSelect(emp.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            Object.entries(grouped).map(([dept, emps]) => (
              <div key={dept} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-800/40">
                  <Building2 size={14} className="text-blue-400 shrink-0" />
                  <span className="font-medium text-sm text-gray-200">{dept}</span>
                  <span className="ml-auto text-xs text-gray-500 bg-gray-700/60 px-2 py-0.5 rounded-full">{emps.length} người</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {emps.map(emp => (
                      <EmployeeRow key={emp.id} emp={emp}
                        selected={selected.has(emp.id)} onToggle={() => toggleSelect(emp.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function EmployeeRow({ emp, selected, onToggle }: { emp: Employee; selected: boolean; onToggle: () => void }) {
  const dept = emp.department as { name: string } | undefined
  return (
    <tr
      className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer ${selected ? 'bg-blue-600/5' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return
        window.location.href = `/dashboard/employees/${emp.id}`
      }}
    >
      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle}
          className="rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer" />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0 text-blue-400 text-xs font-medium">
            {emp.full_name.charAt(0)}
          </div>
          <span className="font-medium text-white">{emp.full_name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{emp.employee_code || '—'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{dept?.name || '—'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{emp.email || '—'}</td>
      <td className="px-4 py-2.5 text-right text-xs text-gray-600">→</td>
    </tr>
  )
}
