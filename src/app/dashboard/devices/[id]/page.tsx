'use client'
// Chi tiết thiết bị — Kho Tổng (30/09/2026), đúng thiết kế Sếp chốt:
//  Thông tin chung (sửa xong bấm LƯU, không tự lưu) · Nhập kho / Đã cấp / Thu hồi / Luân chuyển /
//  Tồn kho tự tính · Thông số kĩ thuật riêng theo Loại · 4 bảng lịch sử · Đang giữ thiết bị · QR.
//  Thông số + 4 bảng lịch sử mặc định THU GỌN, bấm tiêu đề mới xổ ra; lập phiếu bằng 4 nút ở trang
//  danh sách Thiết bị (Sếp chốt 30/09 — bỏ nút "Thêm dòng" trong chi tiết cho đỡ trùng).
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Download, Printer, QrCode, Save, Trash2, Undo2, User } from 'lucide-react'
import DatePicker from '@/components/DatePicker'
import { useRole } from '@/lib/hooks/useRole'
import {
  CATEGORY_LABEL, CATEGORY_ORDER, MOVE_DEFS, MOVE_ORDER, SPEC_FIELDS, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER,
  fmtDate, deviceName, todayIso, type MoveType,
} from '@/lib/kho/config'
import { computeHolders } from '@/lib/kho/holders'
import type { DeviceCategory, DeviceStatus } from '@/lib/types'
import type { FirestoreMove } from '@/lib/firestore/types'
import { PrintPreview, type PrintableMove } from '@/components/kho/PhieuPrint'

interface DeviceJson {
  id: string; asset_code: string; category: DeviceCategory; brand: string; model: string
  serial_number: string | null; status: DeviceStatus; warranty_from: string | null; warranty_expiry: string | null
  image_url: string | null; specs: Record<string, string>; stock_migrated: boolean
  stock: { in: number; out: number; back: number; move: number; left: number; held: number }
}
type Form = {
  asset_code: string; category: DeviceCategory; brand: string; model: string; serial_number: string
  status: DeviceStatus; warranty_from: string; warranty_expiry: string; specs: Record<string, string>
}
const toForm = (d: DeviceJson): Form => ({
  asset_code: d.asset_code, category: d.category, brand: d.brand || '', model: d.model || '', serial_number: d.serial_number || '',
  status: d.status, warranty_from: d.warranty_from || '', warranty_expiry: d.warranty_expiry || '', specs: { ...(d.specs || {}) },
})

function dayDiff(a: string, b: string) {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
  return Math.round((p(b) - p(a)) / 86400000)
}
function WarrantyBadge({ to }: { to: string }) {
  if (!to) return null
  const left = dayDiff(todayIso(), to)
  if (left < 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Hết hạn</span>
  if (left <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Sắp hết · còn {left} ngày</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Còn hạn · {left} ngày</span>
}

// Cột của từng bảng lịch sử (đúng thiết kế Sếp) — [tiêu đề, lấy giá trị]
type Row = { m: FirestoreMove; qty: number; condition: string; note: string }
const COLS: Record<MoveType, [string, (r: Row) => string][]> = {
  NK: [['Ngày nhập', (r) => fmtDate(r.m.date)], ['Số lượng', (r) => String(r.qty)], ['Nhà cung cấp', (r) => r.m.info.ncc || ''], ['Người nhập', (r) => r.m.info.nguoi || ''], ['Tình trạng', (r) => r.condition], ['Ghi chú', (r) => r.note || r.m.info.dien || '']],
  XK: [['Người nhận', (r) => r.m.info.nguoi || ''], ['Số lượng', (r) => String(r.qty)], ['Ngày cấp phát', (r) => fmtDate(r.m.date)], ['Lý do cấp phát', (r) => r.m.info.lydo || ''], ['Tình trạng', (r) => r.condition], ['Phòng ban', (r) => r.m.info.pb || ''], ['Ghi chú', (r) => r.note]],
  TH: [['Người giao', (r) => r.m.info.nguoi || ''], ['Số lượng', (r) => String(r.qty)], ['Ngày thu hồi', (r) => fmtDate(r.m.date)], ['Lý do thu hồi', (r) => r.m.info.lydo || ''], ['Tình trạng', (r) => r.condition], ['Phòng ban', (r) => r.m.info.pb || ''], ['Ghi chú', (r) => r.note]],
  LC: [['Người chuyển', (r) => r.m.info.nguoi || ''], ['Người nhận', (r) => r.m.info.nguoi2 || ''], ['Số lượng', (r) => String(r.qty)], ['Ngày chuyển', (r) => fmtDate(r.m.date)], ['Lý do chuyển', (r) => r.m.info.lydo || ''], ['Tình trạng', (r) => r.condition], ['Phòng ban chuyển', (r) => r.m.info.pb || ''], ['Phòng ban nhận', (r) => r.m.info.pb2 || ''], ['Ghi chú', (r) => r.note]],
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { canWrite, isAdmin } = useRole()
  const [device, setDevice] = useState<DeviceJson | null>(null)
  const [moves, setMoves] = useState<FirestoreMove[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [qr, setQr] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const [preview, setPreview] = useState<PrintableMove | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const [reload, setReload] = useState(0)
  const load = () => setReload((n) => n + 1)
  useEffect(() => {
    let alive = true
    fetch(`/api/devices/${id}`).then(async (res) => {
      const json = await res.json()
      if (!alive) return
      if (!res.ok || !json.data) { router.push('/dashboard/devices'); return }
      setDevice(json.data); setForm(toForm(json.data)); setMoves(json.moves || []); setLoading(false)
    })
    return () => { alive = false }
  }, [id, router, reload])

  useEffect(() => {
    if (!device) return
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(`${window.location.origin}/device/${device.id}`, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#111827' } }).then(setQr))
  }, [device])

  const dirty = useMemo(() => !!device && !!form && JSON.stringify(toForm(device)) !== JSON.stringify(form), [device, form])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const holders = useMemo(() => (device ? computeHolders(moves, device.id).filter((h) => h.qty > 0) : []), [moves, device])

  async function save() {
    if (!form || !device) return
    if (!form.asset_code.trim()) { setMsg({ ok: false, text: 'Mã tài sản không được để trống' }); return }
    setSaving(true); setMsg(null)
    const fields = SPEC_FIELDS[form.category] || []
    const keys = new Set([...fields, ...Object.keys(device.specs || {})])
    const specs = Object.fromEntries([...keys].map((k) => [k, form.specs[k] || '']))
    const res = await fetch(`/api/devices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, specs }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg({ ok: false, text: json.error || 'Chưa lưu được' }); return }
    setDevice(json.data); setForm(toForm(json.data)); setMsg({ ok: true, text: 'Đã lưu' })
    setTimeout(() => setMsg(null), 2500)
  }

  async function removeDevice() {
    const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { setConfirmDel(false); setMsg({ ok: false, text: json.error }); return }
    router.push('/dashboard/devices')
  }

  async function removeMove(m: FirestoreMove) {
    if (!confirm(`Xoá phiếu ${m.so || '(dữ liệu cũ)'}? Số liệu tồn sẽ được trả lại như trước khi lập phiếu.`)) return
    const res = await fetch(`/api/moves/${m.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { alert(json.error); return }
    load()
  }

  if (loading || !device || !form) return <div className="p-8 text-gray-400">Đang tải...</div>

  const f = form
  const set = (patch: Partial<Form>) => setForm({ ...f, ...patch })
  const ro = !canWrite
  const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-70'
  const s = device.stock
  const specFields = SPEC_FIELDS[f.category] || []
  const extraSpecs = Object.keys(f.specs).filter((k) => !specFields.includes(k) && f.specs[k])

  const rowsOf = (t: MoveType): Row[] => moves.filter((m) => m.type === t).map((m) => {
    const ls = m.lines.filter((l) => l.deviceId === device.id)
    return { m, qty: ls.reduce((a, l) => a + l.qty, 0), condition: ls[0]?.condition || '', note: ls.map((l) => l.note).filter(Boolean).join('; ') }
  })

  return (
    <div className="p-6 lg:p-8 max-w-6xl pb-28">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/devices" className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">{device.asset_code}</h1>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_COLOR[device.status]}`}>{STATUS_LABEL[device.status]}</span>
          </div>
          <p className="text-gray-400 text-sm mt-0.5">{deviceName(device)}</p>
        </div>
        {canWrite && (
          <button onClick={() => setConfirmDel(true)} className="flex items-center gap-2 border border-red-800/50 hover:border-red-600 px-4 py-2 rounded-lg text-sm text-red-400">
            <Trash2 size={14} /> Xoá
          </button>
        )}
      </div>

      {!device.stock_migrated && isAdmin && (
        <div className="mb-4 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3">
          Thiết bị này chưa chuyển số liệu cũ sang Kho Tổng — đang tạm lấy số lượng cũ ({s.in}) làm Nhập kho. Sẽ đúng hẳn sau khi chạy chuyển dữ liệu.
        </div>
      )}

      {/* ===== Thông tin chung ===== */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-semibold">Thông tin chung</h2>
          {canWrite && <span className="text-xs text-gray-500">sửa xong bấm <b>Lưu</b> ở góc dưới</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Fld label="Mã tài sản"><input className={input + ' font-mono'} disabled={ro} value={f.asset_code} onChange={(e) => set({ asset_code: e.target.value })} /></Fld>
          <Fld label="Loại">
            <select className={input} disabled={ro} value={f.category} onChange={(e) => set({ category: e.target.value as DeviceCategory })}>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </Fld>
          <Fld label="Hãng"><input className={input} disabled={ro} value={f.brand} onChange={(e) => set({ brand: e.target.value })} /></Fld>
          <Fld label="Model"><input className={input} disabled={ro} value={f.model} onChange={(e) => set({ model: e.target.value })} /></Fld>
          <Fld label="Số Seri"><input className={input} disabled={ro} value={f.serial_number} onChange={(e) => set({ serial_number: e.target.value })} /></Fld>

          <Stat label="Nhập kho" v={s.in} hint="cộng từ Lịch sử nhập kho" green />
          <Stat label="Đã cấp" v={s.out} hint="cộng từ Lịch sử cấp phát" />
          <Stat label="Thu hồi" v={s.back} hint="cộng từ Lịch sử thu hồi" />
          <Stat label="Luân chuyển" v={s.move} hint="không làm đổi tồn" />
          <Stat label="Tồn kho" v={s.left} hint={`= ${s.in} − ${s.out} + ${s.back}`} green />

          <Fld label="Trạng thái">
            <select className={input} disabled={ro} value={f.status} onChange={(e) => set({ status: e.target.value as DeviceStatus })}>
              {STATUS_ORDER.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Tự đổi khi cấp phát / thu hồi</p>
          </Fld>
          <div className="col-span-2">
            <div className="text-xs text-gray-400 mb-1">Thời gian bảo hành</div>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-[11px] text-gray-500">Từ ngày</div>{ro ? <div className="text-sm py-2">{fmtDate(f.warranty_from)}</div> : <DatePicker value={f.warranty_from} onChange={(v) => set({ warranty_from: v })} />}</div>
              <div><div className="text-[11px] text-gray-500">Đến ngày</div>{ro ? <div className="text-sm py-2">{fmtDate(f.warranty_expiry)}</div> : <DatePicker value={f.warranty_expiry} onChange={(v) => set({ warranty_expiry: v })} />}</div>
            </div>
            <div className="mt-1.5"><WarrantyBadge to={f.warranty_expiry} /></div>
          </div>
          {device.image_url && (
            <Fld label="Ảnh">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={device.image_url} alt="" className="w-24 h-24 object-cover rounded-lg border border-gray-700" />
            </Fld>
          )}
        </div>
      </section>

      {/* ===== Thông số kĩ thuật (riêng theo Loại) ===== */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl mb-4">
        <FoldHead open={!!open.specs} onClick={() => toggle('specs')} title="Thông số kĩ thuật"
          extra={<span className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-400">riêng theo Loại: {CATEGORY_LABEL[f.category]}</span>}
          count={`${[...specFields, ...extraSpecs].filter((k) => f.specs[k]).length}/${specFields.length + extraSpecs.length} trường có dữ liệu`} />
        {open.specs && <div className="px-5 pb-5">{specFields.length || extraSpecs.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...specFields, ...extraSpecs].map((k) => (
              <Fld key={k} label={k}>
                <input className={input} disabled={ro} value={f.specs[k] || ''} onChange={(e) => set({ specs: { ...f.specs, [k]: e.target.value } })} />
              </Fld>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">Loại &quot;{CATEGORY_LABEL[f.category]}&quot; chưa có trường thông số (sẽ thêm được ở &quot;Sửa giao diện&quot;).</p>}</div>}
      </section>

      {/* ===== 4 bảng lịch sử ===== */}
      {MOVE_ORDER.map((t) => {
        const rows = rowsOf(t)
        return (
          <section key={t} className="bg-gray-900 border border-gray-800 rounded-xl mb-4">
            <FoldHead open={!!open[t]} onClick={() => toggle(t)} title={MOVE_DEFS[t].history} count={`${rows.length} phiếu`} />
            {open[t] && <div className="px-5 pb-5"><div className="overflow-x-auto border border-gray-800 rounded-lg">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-800 bg-gray-800/30">
                    <th className="px-3 py-2">Số phiếu</th>
                    {COLS[t].map(([h]) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((r) => (
                    <tr key={r.m.id} className="border-b border-gray-800/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-blue-300 whitespace-nowrap">{r.m.so || <span className="text-gray-500">dữ liệu cũ</span>}</td>
                      {COLS[t].map(([h, get]) => <td key={h} className="px-3 py-2">{get(r) || <span className="text-gray-600">—</span>}</td>)}
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button title="In lại phiếu" onClick={() => setPreview(r.m)} className="text-gray-400 hover:text-white p-1"><Printer size={14} /></button>
                        {isAdmin && <button title="Xoá phiếu (Admin)" onClick={() => removeMove(r.m)} className="text-gray-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                  )) : <tr><td colSpan={COLS[t].length + 2} className="px-3 py-5 text-center text-gray-500 text-sm">Chưa có dòng nào</td></tr>}
                </tbody>
              </table>
            </div></div>}
          </section>
        )
      })}

      <div className="grid md:grid-cols-3 gap-5">
        {/* ===== Đang giữ thiết bị ===== */}
        <section className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-semibold">Đang giữ thiết bị</h2>
            <span className="text-xs px-2 py-0.5 rounded border border-gray-700 text-gray-400">tự động</span>
            <span className="text-xs text-gray-500">= Cấp phát − Thu hồi ± Luân chuyển, theo từng người</span>
          </div>
          {holders.length ? (
            <div className="flex flex-wrap gap-2">
              {holders.map((h) => (
                <div key={h.key} className="flex items-center gap-2 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                  <User size={14} className="text-blue-400" /> {h.name}{h.pb && <span className="text-gray-500 text-xs">· {h.pb}</span>}
                  <b className="font-mono text-green-400">{h.qty}</b>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-500">Chưa ai giữ — tất cả đang ở kho</p>}
        </section>

        {/* ===== QR ===== */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
          <h2 className="font-semibold mb-3 flex items-center justify-center gap-2"><QrCode size={16} className="text-blue-400" /> QR Code</h2>
          {qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR" className="mx-auto rounded-lg mb-3 w-40" />
              <a href={qr} download={`QR-${device.asset_code}.png`} className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">
                <Download size={14} /> Tải về để in
              </a>
            </>
          ) : <div className="w-40 h-40 mx-auto bg-gray-800 rounded-lg animate-pulse" />}
        </section>
      </div>

      {/* ===== Thanh Lưu (chỉ hiện khi có thay đổi) ===== */}
      {(dirty || msg) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-800 border border-amber-500/60 rounded-xl px-4 py-2.5 shadow-2xl">
          {msg ? <span className={`text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</span> : <span className="text-sm text-amber-300">● Có thay đổi <b>chưa lưu</b></span>}
          {dirty && (
            <>
              <button onClick={() => { setForm(toForm(device)); setMsg(null) }} className="flex items-center gap-1.5 border border-gray-600 hover:border-gray-400 px-3 py-1.5 rounded-lg text-sm"><Undo2 size={14} /> Huỷ thay đổi</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-medium"><Save size={14} /> {saving ? 'Đang lưu…' : 'Lưu'}</button>
            </>
          )}
        </div>
      )}

      {preview && <PrintPreview move={preview} onClose={() => setPreview(null)} />}

      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-lg mb-2">Xoá thiết bị {device.asset_code}?</h3>
            <p className="text-gray-400 text-sm mb-5">Chỉ xoá được khi thiết bị chưa có phiếu nào. Thao tác không hoàn tác được.</p>
            <div className="flex gap-3">
              <button onClick={removeDevice} className="flex-1 bg-red-600 hover:bg-red-500 py-2.5 rounded-lg text-sm font-medium">Xoá</button>
              <button onClick={() => setConfirmDel(false)} className="flex-1 border border-gray-700 py-2.5 rounded-lg text-sm text-gray-300">Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Tiêu đề khối thu gọn / xổ ra
function FoldHead({ open, onClick, title, count, extra }: { open: boolean; onClick: () => void; title: string; count: string; extra?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-800/30 rounded-xl">
      <ChevronRight size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      <h2 className="font-semibold">{title}</h2>
      {extra}
      <span className="text-xs text-gray-500">{count}</span>
      <span className="flex-1" />
      <span className="text-xs text-gray-500">{open ? 'Thu gọn' : 'Bấm để xem'}</span>
    </button>
  )
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-xs text-gray-400 mb-1">{label}</div>{children}</div>
}
function Stat({ label, v, hint, green }: { label: string; v: number; hint: string; green?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${green ? 'border-green-500/30' : 'border-gray-700'} bg-gray-800/40`}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-xl font-bold font-mono ${v < 0 ? 'text-red-400' : green ? 'text-green-400' : ''}`}>{v}</div>
      <div className="text-[11px] text-gray-500">tự tính: {hint}</div>
    </div>
  )
}
