'use client'
// Danh sách Thiết bị (= Danh mục thiết bị, Sếp chốt gộp 30/09/2026). Cột theo thiết kế:
// Mã tài sản · Loại · Hãng · Model · Số Seri · Nhập kho · Đã cấp · Tồn kho · Trạng thái · Bảo hành.
// 4 nút lập phiếu ở đầu trang (1 phiếu nhiều thiết bị) + "Thêm thiết bị" (thêm mã vào danh mục).
import { useState, useEffect, useMemo } from 'react'
import { Search, Plus, QrCode, FileSpreadsheet, Package, X, ArrowDownToLine, ArrowUpFromLine, RotateCcw, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DeviceStatus, DeviceCategory } from '@/lib/types'
import { useRole } from '@/lib/hooks/useRole'
import { CATEGORY_LABEL, CATEGORY_ORDER, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, fmtDate, normalizeVi, type MoveType } from '@/lib/kho/config'
import PhieuModal from '@/components/kho/PhieuModal'

interface Device {
  id: string; asset_code: string; category: DeviceCategory; brand: string; model: string
  serial_number?: string | null; status: DeviceStatus; warranty_from?: string | null; warranty_expiry?: string | null
  stock: { in: number; out: number; back: number; move: number; left: number; held: number }
}

const MOVE_BTNS: { t: MoveType; label: string; icon: React.ElementType }[] = [
  { t: 'NK', label: 'Nhập kho', icon: ArrowDownToLine },
  { t: 'XK', label: 'Cấp phát', icon: ArrowUpFromLine },
  { t: 'TH', label: 'Thu hồi', icon: RotateCcw },
  { t: 'LC', label: 'Luân chuyển', icon: ArrowRightLeft },
]

export default function DevicesPage() {
  const { canWrite } = useRole()
  const router = useRouter()
  const [allDevices, setAllDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<DeviceCategory | ''>('')
  const [filterStatus, setFilterStatus] = useState<DeviceStatus | ''>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [modal, setModal] = useState<MoveType | null>(null)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState('')

  const [reload, setReload] = useState(0)
  const fetchDevices = () => setReload((n) => n + 1)
  useEffect(() => {
    let alive = true
    fetch('/api/devices').then((r) => r.json()).then((json) => {
      if (!alive) return
      setAllDevices((json.data as Device[]) || [])
      setLoading(false)
      // Ô Tổng quan mở trang này kèm ?status= / ?category= → nhận sẵn bộ lọc (lần tải đầu)
      if (reload === 0) {
        const p = new URLSearchParams(window.location.search)
        const st = p.get('status') as DeviceStatus | null
        const cat = p.get('category') as DeviceCategory | null
        if (st && STATUS_ORDER.includes(st)) setFilterStatus(st)
        if (cat && CATEGORY_ORDER.includes(cat)) setFilterCategory(cat)
      }
    })
    return () => { alive = false }
  }, [reload])

  const devices = useMemo(() => {
    const q = normalizeVi(search)
    return allDevices.filter((d) =>
      (!filterCategory || d.category === filterCategory) &&
      (!filterStatus || d.status === filterStatus) &&
      (!q || [d.asset_code, d.brand, d.model, d.serial_number || ''].some((x) => normalizeVi(x).includes(q))))
  }, [allDevices, search, filterCategory, filterStatus])

  function flash(t: string) { setToast(t); setTimeout(() => setToast(''), 2600) }
  function toggleSelect(id: string) { setSelected((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s }) }
  function toggleAll() { setSelected((prev) => (prev.size === devices.length ? new Set() : new Set(devices.map((d) => d.id)))) }

  async function handleExport() {
    setExporting(true)
    const res = await fetch('/api/devices/export')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `ThietBi_KhoIT_${new Date().toISOString().split('T')[0]}.xlsx`
    a.click(); URL.revokeObjectURL(url)
    setExporting(false)
  }

  const sel = 'bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500'

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold">Thiết bị</h1>
          <p className="text-gray-400 text-sm mt-1">{loading ? '...' : `${devices.length} mã trong danh mục`} · bấm 1 dòng để xem chi tiết</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 border border-gray-700 hover:border-gray-500 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 disabled:opacity-50">
            <FileSpreadsheet size={16} /> {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
          {canWrite && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-lg text-sm font-medium">
              <Plus size={16} /> Thêm thiết bị
            </button>
          )}
        </div>
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2 mb-5">
          {MOVE_BTNS.map(({ t, label, icon: Icon }) => (
            <button key={t} onClick={() => setModal(t)} className="flex items-center gap-2 bg-gray-900 border border-gray-700 hover:border-blue-500 px-4 py-2 rounded-lg text-sm">
              <Icon size={15} className="text-blue-400" /> + {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Tìm mã, seri, hãng, model..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as DeviceCategory | '')} className={sel}>
          <option value="">Loại: Tất cả</option>
          {CATEGORY_ORDER.map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as DeviceStatus | '')} className={sel}>
          <option value="">Trạng thái: Tất cả</option>
          {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-blue-600/10 border border-blue-500/30 rounded-xl">
          <span className="text-sm text-blue-300 flex-1">Đã chọn <strong>{selected.size}</strong> thiết bị</span>
          <button onClick={() => router.push(`/dashboard/devices/print-qr?ids=${Array.from(selected).join(',')}`)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium">
            <QrCode size={15} /> In QR ({selected.size})
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-400 hover:text-white border border-gray-700 px-3 py-2 rounded-lg">Bỏ chọn</button>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3 w-10"><input type="checkbox" checked={devices.length > 0 && selected.size === devices.length} onChange={toggleAll} className="accent-blue-500 cursor-pointer" /></th>
              <th className="px-4 py-3 font-medium">Mã tài sản</th>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">Hãng</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Số Seri</th>
              <th className="px-4 py-3 font-medium text-right">Nhập kho</th>
              <th className="px-4 py-3 font-medium text-right">Đã cấp</th>
              <th className="px-4 py-3 font-medium text-right">Tồn kho</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Bảo hành</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-16 text-center text-gray-500">Đang tải...</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-16 text-center text-gray-500"><Package size={32} className="mx-auto mb-3 opacity-30" />Không có thiết bị nào khớp</td></tr>
            ) : devices.map((d) => {
              const expired = d.warranty_expiry && d.warranty_expiry < new Date().toISOString().slice(0, 10)
              return (
                <tr key={d.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('input')) router.push(`/dashboard/devices/${d.id}`) }}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer ${selected.has(d.id) ? 'bg-blue-600/5' : ''}`}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} className="accent-blue-500 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 font-mono text-blue-400"><Link href={`/dashboard/devices/${d.id}`}>{d.asset_code}</Link></td>
                  <td className="px-4 py-3 text-gray-300">{CATEGORY_LABEL[d.category]}</td>
                  <td className="px-4 py-3">{d.brand || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-300">{d.model || <span className="text-gray-600">—</span>}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{d.serial_number || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{d.stock.in}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{d.stock.out}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${d.stock.left < 0 ? 'text-red-400' : 'text-green-400'}`}>{d.stock.left}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${STATUS_COLOR[d.status]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABEL[d.status]}</span></td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {d.warranty_expiry ? <span className={expired ? 'text-red-400' : 'text-gray-400'}>{d.warranty_from ? `${fmtDate(d.warranty_from)} → ` : 'đến '}{fmtDate(d.warranty_expiry)}</span> : <span className="text-gray-600">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && <PhieuModal type={modal} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); flash(`Đã lưu phiếu ${m.so}`); fetchDevices() }} />}
      {adding && <AddDeviceModal onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); router.push(`/dashboard/devices/${id}`) }} />}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-600 px-4 py-2.5 rounded-xl text-sm shadow-xl">{toast}</div>}
    </div>
  )
}

// Thêm mã vào Danh mục — đúng 5 cột Sếp chốt: Mã tài sản · Loại · Hãng · Model · Số Seri
function AddDeviceModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ asset_code: '', category: '' as DeviceCategory | '', brand: '', model: '', serial_number: '' })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500'
  async function save() {
    if (!f.asset_code.trim() || !f.category) { setErr('Cần nhập Mã tài sản và chọn Loại'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/devices/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(json.error || 'Chưa lưu được'); return }
    onSaved(json.data.id)
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg">
        <div className="flex items-center px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-lg flex-1">Thêm thiết bị vào danh mục</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Mã tài sản <b className="text-red-400">*</b></label><input className={input + ' font-mono'} value={f.asset_code} onChange={(e) => setF({ ...f, asset_code: e.target.value })} placeholder="VD LT-007" autoFocus /></div>
          <div><label className="block text-xs text-gray-400 mb-1">Loại <b className="text-red-400">*</b></label>
            <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as DeviceCategory })}>
              <option value="">— chọn —</option>
              {CATEGORY_ORDER.map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-gray-400 mb-1">Hãng</label><input className={input} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></div>
          <div><label className="block text-xs text-gray-400 mb-1">Model</label><input className={input} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></div>
          <div><label className="block text-xs text-gray-400 mb-1">Số Seri</label><input className={input} value={f.serial_number} onChange={(e) => setF({ ...f, serial_number: e.target.value })} /></div>
          <p className="col-span-2 text-xs text-gray-500">Thiết bị mới có tồn 0 — sau khi thêm, bấm <b>+ Nhập kho</b> để ghi số lượng. Thông số kĩ thuật, bảo hành nhập ở trang chi tiết.</p>
          {err && <p className="col-span-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="border border-gray-700 px-4 py-2 rounded-lg text-sm text-gray-300">Huỷ</button>
          <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  )
}
