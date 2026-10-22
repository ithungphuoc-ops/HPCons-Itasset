'use client'
// Chi tiết thiết bị — Kho Tổng (30/09/2026), đúng thiết kế Sếp chốt:
//  Thông tin chung (sửa xong bấm LƯU, không tự lưu) · Nhập kho / Đã cấp / Thu hồi / Luân chuyển /
//  Tồn kho tự tính · Thông số kĩ thuật riêng theo Loại · 4 bảng lịch sử · Đang giữ thiết bị · QR.
//  Thông số + 4 bảng lịch sử mặc định THU GỌN, bấm tiêu đề mới xổ ra; lập phiếu bằng 4 nút ở trang
//  danh sách Thiết bị (Sếp chốt 30/09 — bỏ nút "Thêm dòng" trong chi tiết cho đỡ trùng).
// 10/10/2026 (Sếp duyệt demo "liên kết chức năng"): trang này là trung tâm của thiết bị —
//  • Nút Nhập thêm / Cấp phát / Thu hồi / Luân chuyển mở đúng popup phiếu, điền sẵn mã này
//  • Mã · Loại · Hãng · Model · Seri + thông số ĐÃ CÓ khoá: chỉ Admin sửa (ghi lý do); ô trống ai có
//    quyền ghi cũng bổ sung được; mọi lần sửa ghi "Lịch sử sửa thông số"
//  • Đang giữ: bấm tên mở trang nhân viên, nút Thu hồi / Chuyển ngay tại người đó
//  • Mục "Công việc của thiết bị" (công việc gắn mã này) + nút Tạo công việc
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowDownToLine, ArrowLeft, ArrowRightLeft, ArrowUpFromLine, ChevronRight, Download, Lock, Pencil, Printer, QrCode, RotateCcw, Save, Search, Trash2, TriangleAlert, Undo2, User, Wrench, X } from 'lucide-react'
import PhieuModal from '@/components/kho/PhieuModal'
import { PhotoCell, PhotoLightbox, SignStatus, type Lightbox } from '@/components/kho/Photos'
import type { Task } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import { useRole } from '@/lib/hooks/useRole'
import {
  MOVE_DEFS, MOVE_ORDER, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER,
  fmtDate, todayIso, normalizeVi, type MoveType,
} from '@/lib/kho/config'
import { computeHolders } from '@/lib/kho/holders'
import type { DeviceCategory, DeviceStatus } from '@/lib/types'
import type { FirestoreMove } from '@/lib/firestore/types'
import { PrintPreview, type PrintableMove } from '@/components/kho/PhieuPrint'
import { catLabel, deviceNameS, missingSpecs, specFieldsOf, type ExtraField } from '@/lib/kho/settings'
import { useKhoSettings } from '@/lib/kho/useKhoSettings'
import type { SpecLogEntry } from '@/lib/firestore/types'
import { computeTaskStatus, TASK_STATUS_COLOR, TASK_STATUS_LABEL } from '@/lib/task-status'

const TASK_TYPE_LABEL: Record<string, string> = { repair: 'Sửa chữa', warranty: 'Bảo hành', install: 'Cài đặt', support: 'Hỗ trợ', other: 'Khác' }

interface DeviceJson {
  id: string; asset_code: string; category: DeviceCategory; brand: string; model: string
  serial_number: string | null; status: DeviceStatus; warranty_from: string | null; warranty_expiry: string | null
  image_url: string | null; specs: Record<string, string>; extra: Record<string, string>; stock_migrated: boolean
  stock: { in: number; out: number; back: number; move: number; left: number; held: number }
  spec_lock: { at: string; so: string | null; via: string } | null
  spec_log: SpecLogEntry[]
}
// Bộ sửa thông số (Admin sửa / bổ sung ô trống) — tách khỏi form "Thông tin chung" + thanh Lưu
type SpecEd = { asset_code: string; category: DeviceCategory; brand: string; model: string; serial_number: string; specs: Record<string, string> }
type Form = {
  asset_code: string; category: DeviceCategory; brand: string; model: string; serial_number: string
  status: DeviceStatus; warranty_from: string; warranty_expiry: string; specs: Record<string, string>; extra: Record<string, string>
}
const toForm = (d: DeviceJson): Form => ({
  asset_code: d.asset_code, category: d.category, brand: d.brand || '', model: d.model || '', serial_number: d.serial_number || '',
  status: d.status, warranty_from: d.warranty_from || '', warranty_expiry: d.warranty_expiry || '', specs: { ...(d.specs || {}) }, extra: { ...(d.extra || {}) },
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
  NK: [['Ngày nhập', (r) => fmtDate(r.m.date)], ['Số lượng', (r) => String(r.qty)], ['Nhà cung cấp', (r) => r.m.info.ncc || ''], ['MST NCC', (r) => r.m.info.mst || ''], ['Người nhập', (r) => r.m.info.nguoi || ''], ['Tình trạng', (r) => r.condition], ['Ghi chú', (r) => r.note || r.m.info.dien || '']],
  XK: [['Người nhận', (r) => r.m.info.nguoi || ''], ['Số lượng', (r) => String(r.qty)], ['Ngày cấp phát', (r) => fmtDate(r.m.date)], ['Lý do cấp phát', (r) => r.m.info.lydo || ''], ['Tình trạng', (r) => r.condition], ['Phòng ban', (r) => r.m.info.pb || ''], ['Ghi chú', (r) => r.note]],
  TH: [['Người giao', (r) => r.m.info.nguoi || ''], ['Số lượng', (r) => String(r.qty)], ['Ngày thu hồi', (r) => fmtDate(r.m.date)], ['Lý do thu hồi', (r) => r.m.info.lydo || ''], ['Tình trạng', (r) => r.condition], ['Phòng ban', (r) => r.m.info.pb || ''], ['Ghi chú', (r) => r.note]],
  LC: [['Người chuyển', (r) => r.m.info.nguoi || ''], ['Người nhận', (r) => r.m.info.nguoi2 || ''], ['Số lượng', (r) => String(r.qty)], ['Ngày chuyển', (r) => fmtDate(r.m.date)], ['Lý do chuyển', (r) => r.m.info.lydo || ''], ['Tình trạng', (r) => r.condition], ['Phòng ban chuyển', (r) => r.m.info.pb || ''], ['Phòng ban nhận', (r) => r.m.info.pb2 || ''], ['Ghi chú', (r) => r.note]],
}

// Bộ lọc 4 bảng lịch sử (Sếp yêu cầu 02/10/2026 — phiếu nhiều lên thì lọc cho dễ): lọc theo người nào ở từng bảng
const PERSON_FILTER: Record<MoveType, { label: string; of: (m: FirestoreMove) => string[] }> = {
  NK: { label: 'Nhà cung cấp', of: (m) => [m.info.ncc || ''] },
  XK: { label: 'Người nhận', of: (m) => [m.info.nguoi || ''] },
  TH: { label: 'Người giao', of: (m) => [m.info.nguoi || ''] },
  LC: { label: 'Người chuyển / nhận', of: (m) => [m.info.nguoi || '', m.info.nguoi2 || ''] },
}
type Flt = { q: string; who: string; from: string; to: string }
const NO_FLT: Flt = { q: '', who: '', from: '', to: '' }

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { canWrite, isAdmin } = useRole()
  // Tên trường, Loại, thông số, trường bổ sung theo "Sửa giao diện" (Đợt 2)
  const { settings: S } = useKhoSettings()
  const L = S.fieldLabels
  const [device, setDevice] = useState<DeviceJson | null>(null)
  const [moves, setMoves] = useState<FirestoreMove[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [qr, setQr] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [flt, setFlt] = useState<Partial<Record<MoveType, Flt>>>({})
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const [preview, setPreview] = useState<PrintableMove | null>(null)
  const [lb, setLb] = useState<Lightbox>(null) // xem ảnh phiếu to (22/10/2026)
  const [confirmDel, setConfirmDel] = useState(false)
  const [phieu, setPhieu] = useState<{ type: MoveType; person?: string } | null>(null)
  const [ed, setEd] = useState<SpecEd | null>(null)
  const [reason, setReason] = useState('')
  const [edErr, setEdErr] = useState('')
  const [edSaving, setEdSaving] = useState(false)
  const [devTasks, setDevTasks] = useState<Task[]>([])
  const [empIds, setEmpIds] = useState<Map<string, string>>(new Map())

  // Công việc gắn thiết bị này + bảng tên → id nhân viên (bấm tên người đang giữ mở trang nhân viên).
  // Cả 2 API đều có cache, mở trang không tốn thêm lượt đọc đáng kể.
  useEffect(() => {
    let alive = true
    fetch('/api/tasks').then((r) => r.json()).then((j) => { if (alive) setDevTasks(((j.data || []) as Task[]).filter((t) => t.deviceId === id)) }).catch(() => {})
    fetch('/api/employees').then((r) => r.json()).then((j) => {
      if (alive) setEmpIds(new Map(((j.data || []) as { id: string; full_name: string }[]).map((e) => [normalizeVi(e.full_name), e.id])))
    }).catch(() => {})
    return () => { alive = false }
  }, [id])

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

  // Thanh Lưu: chỉ Trạng thái · Bảo hành · trường bổ sung. Mã / Loại / Hãng / Model / Seri + thông số
  // sửa ở khung "Sửa thông số" riêng (khoá, có lý do) — không gửi lại ở đây để khỏi đè nhầm.
  async function save() {
    if (!form || !device) return
    setSaving(true); setMsg(null)
    const extra = Object.fromEntries(S.extraFields.map((x) => [x.key, form.extra[x.key] || '']))
    const res = await fetch(`/api/devices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: form.status, warranty_from: form.warranty_from, warranty_expiry: form.warranty_expiry, extra }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg({ ok: false, text: json.error || 'Chưa lưu được' }); return }
    setDevice(json.data); setForm(toForm(json.data)); setMsg({ ok: true, text: 'Đã lưu' })
    setTimeout(() => setMsg(null), 2500)
  }

  function openEd() {
    if (!device) return
    setEd({ asset_code: device.asset_code, category: device.category, brand: device.brand || '', model: device.model || '', serial_number: device.serial_number || '', specs: { ...(device.specs || {}) } })
    setReason(''); setEdErr('')
    setOpen((o) => ({ ...o, specs: true }))
  }
  async function saveSpecs() {
    if (!ed || !device) return
    if (!ed.asset_code.trim()) { setEdErr(`${L.asset_code} không được để trống`); return }
    setEdSaving(true); setEdErr('')
    const keys = new Set([...specFieldsOf(S, ed.category).map((x) => x.key), ...Object.keys(device.specs || {})])
    const res = await fetch(`/api/devices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_code: ed.asset_code, category: ed.category !== device.category ? ed.category : undefined,
        brand: ed.brand, model: ed.model, serial_number: ed.serial_number,
        specs: Object.fromEntries([...keys].map((k) => [k, ed.specs[k] || ''])), reason,
      }),
    })
    const json = await res.json()
    setEdSaving(false)
    if (!res.ok) { setEdErr(json.error || 'Chưa lưu được'); return }
    // Giữ nguyên phần Thông tin chung đang sửa dở (chưa bấm Lưu) — chỉ cập nhật phần thông số
    setDevice(json.data)
    setForm((cur) => (cur ? { ...toForm(json.data), status: cur.status, warranty_from: cur.warranty_from, warranty_expiry: cur.warranty_expiry, extra: cur.extra } : toForm(json.data)))
    setEd(null); setMsg({ ok: true, text: 'Đã lưu thông số' })
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
  // Trường thông số của Loại đang chọn + giá trị cũ còn lưu nhưng trường đã bị bỏ (vẫn hiện để không mất)
  const defs = specFieldsOf(S, f.category)
  const specFields: { key: string; label: string; required?: boolean; old?: boolean }[] = [...defs, ...Object.keys(f.specs).filter((k) => !defs.some((x) => x.key === k) && f.specs[k]).map((k) => ({ key: k, label: k, old: true }))]
  const miss = missingSpecs(S, device.category, device.specs)
  const roBox = 'w-full bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 flex items-center gap-2 min-h-[38px]'
  const lockedVal = (v: string | null | undefined, mono?: boolean) => (
    <div className={roBox}>{v ? <><Lock size={12} className="text-blue-300 shrink-0" /><span className={`truncate ${mono ? 'font-mono' : ''}`}>{v}</span></> : <span className="text-gray-500">—</span>}</div>
  )
  // Ô khoá trong khung sửa: Admin sửa mọi ô; người khác chỉ điền ô đang trống
  const lockedFor = (orig: string | null | undefined) => !isAdmin && !!String(orig ?? '').trim()
  const firstHolder = holders[0]?.name

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
          <p className="text-gray-400 text-sm mt-0.5">{deviceNameS(S, device)}</p>
        </div>
        {canWrite && (
          <button onClick={() => setConfirmDel(true)} className="flex items-center gap-2 border border-red-800/50 hover:border-red-600 px-4 py-2 rounded-lg text-sm text-red-400">
            <Trash2 size={14} /> Xoá
          </button>
        )}
      </div>

      {/* Nút lập phiếu ngay tại thiết bị — mở popup điền sẵn mã này (10/10/2026) */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {([['NK', '+ Nhập thêm', ArrowDownToLine, ''], ['XK', 'Cấp phát', ArrowUpFromLine, s.left > 0 ? '' : 'Hết tồn kho'],
            ['TH', 'Thu hồi', RotateCcw, s.held > 0 ? '' : 'Chưa cấp cho ai'], ['LC', 'Luân chuyển', ArrowRightLeft, s.held > 0 ? '' : 'Chưa cấp cho ai']] as const).map(([t, label, Icon, why]) => (
            <button key={t} disabled={!!why} title={why || undefined} onClick={() => setPhieu({ type: t, person: t === 'TH' || t === 'LC' ? firstHolder : undefined })}
              className="flex items-center gap-2 bg-gray-900 border border-gray-700 hover:border-blue-500 px-4 py-2 rounded-lg text-sm disabled:opacity-40 disabled:hover:border-gray-700">
              <Icon size={15} className="text-blue-400" /> {label}
            </button>
          ))}
          <Link href={`/dashboard/tasks/new?deviceId=${device.id}`} className="flex items-center gap-2 bg-gray-900 border border-gray-700 hover:border-blue-500 px-4 py-2 rounded-lg text-sm">
            <Wrench size={15} className="text-blue-400" /> Tạo công việc
          </Link>
        </div>
      )}

      {!device.stock_migrated && isAdmin && (
        <div className="mb-4 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3">
          Thiết bị này chưa chuyển số liệu cũ sang Kho Tổng — đang tạm lấy số lượng cũ ({s.in}) làm Nhập kho. Sẽ đúng hẳn sau khi chạy chuyển dữ liệu.
        </div>
      )}

      {/* ===== Thông tin chung ===== */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-semibold">Thông tin chung</h2>
          {canWrite && <span className="text-xs text-gray-500">sửa xong bấm <b>Lưu</b> ở góc dưới · {L.asset_code} · {L.category} · {L.brand} · {L.model} · {L.serial_number} đã khoá, sửa ở mục Thông số kĩ thuật</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Fld label={L.asset_code}>{lockedVal(device.asset_code, true)}</Fld>
          <Fld label={L.category}>{lockedVal(catLabel(S, device.category))}</Fld>
          <Fld label={L.brand}>{lockedVal(device.brand)}</Fld>
          <Fld label={L.model}>{lockedVal(device.model)}</Fld>
          <Fld label={L.serial_number}>{lockedVal(device.serial_number)}</Fld>

          <Stat label="Nhập kho" v={s.in} hint="cộng từ Lịch sử nhập kho" green />
          <Stat label="Đã cấp" v={s.out} hint="cộng từ Lịch sử cấp phát" />
          <Stat label="Thu hồi" v={s.back} hint="cộng từ Lịch sử thu hồi" />
          <Stat label="Luân chuyển" v={s.move} hint="không làm đổi tồn" />
          <Stat label="Tồn kho" v={s.left} hint={`= ${s.in} − ${s.out} + ${s.back}`} green />

          <Fld label={L.status}>
            <select className={input} disabled={ro} value={f.status} onChange={(e) => set({ status: e.target.value as DeviceStatus })}>
              {STATUS_ORDER.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Tự đổi khi cấp phát / thu hồi</p>
          </Fld>
          <div className="col-span-2">
            <div className="text-xs text-gray-400 mb-1">{L.warranty}</div>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-[11px] text-gray-500">Từ ngày</div>{ro ? <div className="text-sm py-2">{fmtDate(f.warranty_from)}</div> : <DatePicker value={f.warranty_from} onChange={(v) => set({ warranty_from: v })} />}</div>
              <div><div className="text-[11px] text-gray-500">Đến ngày</div>{ro ? <div className="text-sm py-2">{fmtDate(f.warranty_expiry)}</div> : <DatePicker value={f.warranty_expiry} onChange={(v) => set({ warranty_expiry: v })} />}</div>
            </div>
            <div className="mt-1.5"><WarrantyBadge to={f.warranty_expiry} /></div>
          </div>
          {S.extraFields.map((x) => (
            <Fld key={x.key} label={x.label}>
              <ExtraInput field={x} disabled={ro} className={input} value={f.extra[x.key] || ''} onChange={(v) => set({ extra: { ...f.extra, [x.key]: v } })} />
            </Fld>
          ))}
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
          extra={<>
            <span className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-400">riêng theo {L.category}: {catLabel(S, f.category)}</span>
            {miss.length
              ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-400"><TriangleAlert size={12} /> Thiếu {miss.length} thông số bắt buộc</span>
              : device.spec_lock && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-blue-500/40 text-blue-300"><Lock size={12} /> Khoá {device.spec_lock.so ? `theo phiếu ${device.spec_lock.so}` : device.spec_lock.via === 'add' ? 'từ lúc thêm thiết bị' : 'từ lần bổ sung'} · {fmtDate(device.spec_lock.at.slice(0, 10))}</span>}
          </>}
          count={`${specFields.filter((x) => f.specs[x.key]).length}/${specFields.length} trường có dữ liệu`} />
        {open.specs && <div className="px-5 pb-5">
          {ed ? (
            /* ----- Khung sửa: Admin sửa mọi ô (ghi lý do), người khác chỉ điền ô trống ----- */
            <div>
              <div className="text-xs text-gray-400 mb-2">{isAdmin ? 'Admin: sửa được mọi ô — sửa ô đã có giá trị phải ghi lý do.' : 'Chỉ điền được ô đang trống — ô đã có giá trị chỉ Admin sửa.'}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
                <Fld label={L.asset_code}><input className={input + ' font-mono'} disabled={!isAdmin} maxLength={60} value={ed.asset_code} onChange={(e) => setEd({ ...ed, asset_code: e.target.value })} /></Fld>
                <Fld label={L.category}>
                  <select className={input} disabled={!isAdmin} value={ed.category} onChange={(e) => setEd({ ...ed, category: e.target.value as DeviceCategory })}>
                    {!S.categories.some((c) => c.key === ed.category) && <option value={ed.category}>{catLabel(S, ed.category)}</option>}
                    {S.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </Fld>
                <Fld label={L.brand}><input className={input} disabled={lockedFor(device.brand)} value={ed.brand} onChange={(e) => setEd({ ...ed, brand: e.target.value })} /></Fld>
                <Fld label={L.model}><input className={input} disabled={lockedFor(device.model)} value={ed.model} onChange={(e) => setEd({ ...ed, model: e.target.value })} /></Fld>
                <Fld label={L.serial_number}><input className={input} disabled={lockedFor(device.serial_number)} value={ed.serial_number} onChange={(e) => setEd({ ...ed, serial_number: e.target.value })} /></Fld>
              </div>
              {(() => {
                const eDefs = specFieldsOf(S, ed.category)
                const eFields = [...eDefs, ...Object.keys(device.specs || {}).filter((k) => !eDefs.some((x) => x.key === k) && device.specs[k]).map((k) => ({ key: k, label: `${k} (trường cũ)`, required: false }))]
                return eFields.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {eFields.map((x) => (
                      <Fld key={x.key} label={`${x.label}${x.required ? ' *' : ''}`}>
                        <input className={`${input} ${x.required && !ed.specs[x.key]?.trim() ? '!border-amber-500/70' : ''}`} disabled={lockedFor(device.specs?.[x.key])}
                          value={ed.specs[x.key] || ''} onChange={(e) => setEd({ ...ed, specs: { ...ed.specs, [x.key]: e.target.value } })} />
                      </Fld>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-500">{L.category} &quot;{catLabel(S, ed.category)}&quot; chưa có trường thông số.</p>
              })()}
              {isAdmin && (
                <div className="mt-4 max-w-xl">
                  <div className="text-xs text-gray-400 mb-1">Lý do sửa <b className="text-red-400">*</b> <span className="text-gray-500">(không cần nếu chỉ điền ô đang trống)</span></div>
                  <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: nâng cấp Ram 16GB lên 32GB" />
                </div>
              )}
              {edErr && <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{edErr}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={saveSpecs} disabled={edSaving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"><Save size={14} /> {edSaving ? 'Đang lưu…' : 'Lưu thông số'}</button>
                <button onClick={() => { setEd(null); setEdErr('') }} className="border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg text-sm text-gray-300">Huỷ</button>
              </div>
            </div>
          ) : (
            <>
              {miss.length > 0 && (
                <div className="mb-4 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                  <span>Còn thiếu thông số bắt buộc: <b>{miss.map((x) => x.label).join(', ')}</b>. Ô trống điền được ngay, không cần lý do — lần Nhập kho sau cũng sẽ bắt điền nốt.</span>
                  <span className="flex-1" />
                  {canWrite && <button onClick={openEd} className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold px-3 py-1.5 rounded-lg text-sm">Bổ sung thông số</button>}
                </div>
              )}
              {specFields.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {specFields.map((x) => {
                    const v = device.specs?.[x.key]
                    return (
                      <Fld key={x.key} label={`${x.old ? `${x.label} (trường cũ)` : x.label}${x.required ? ' *' : ''}`}>
                        {v ? lockedVal(v) : <div className={`${roBox} border-dashed`}><span className={x.required ? 'text-amber-400' : 'text-gray-500'}>— chưa có</span></div>}
                      </Fld>
                    )
                  })}
                </div>
              ) : <p className="text-sm text-gray-500">{L.category} &quot;{catLabel(S, f.category)}&quot; chưa có trường thông số{isAdmin ? <> — thêm ở <Link href="/dashboard/giao-dien" className="text-blue-400 hover:underline">Sửa giao diện</Link></> : ''}.</p>}
              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-800">
                <span className="text-xs text-gray-500 flex items-center gap-1"><Lock size={11} /> Thông số nhà sản xuất — đã có giá trị là khoá, không ai sửa nhầm được.</span>
                <span className="flex-1" />
                {canWrite && !isAdmin && !miss.length && specFields.some((x) => !device.specs?.[x.key]) && (
                  <button onClick={openEd} className="flex items-center gap-1.5 border border-gray-700 hover:border-blue-500 px-3 py-1.5 rounded-lg text-sm text-gray-300"><Pencil size={13} /> Bổ sung ô trống</button>
                )}
                {isAdmin && (
                  <button onClick={openEd} className="flex items-center gap-1.5 border border-gray-700 hover:border-amber-500 hover:text-amber-300 px-3 py-1.5 rounded-lg text-sm text-gray-300"><Pencil size={13} /> Sửa thông số (chỉ Admin)</button>
                )}
              </div>
              {device.spec_log?.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Lịch sử sửa thông số</div>
                  {[...device.spec_log].sort((a, b) => (a.at < b.at ? 1 : -1)).map((x, k) => (
                    <div key={k} className="text-sm text-gray-300 py-1.5 border-b border-gray-800/60 last:border-0">
                      <span className="text-gray-500 text-xs">{fmtDate(x.at.slice(0, 10))} · {x.by || '—'} · {x.kind === 'edit' ? 'Sửa' : 'Bổ sung'}</span>{' — '}
                      {x.changes.map((c, j) => <span key={j}>{j > 0 && '; '}{c.field}: {c.from ? <span className="text-gray-500 line-through">{c.from}</span> : <span className="text-gray-500">(trống)</span>} → <b>{c.to || '(trống)'}</b></span>)}
                      {x.reason && <i className="text-gray-400"> · {x.reason}</i>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>}
      </section>

      {/* ===== 4 bảng lịch sử ===== */}
      {MOVE_ORDER.map((t) => {
        const all = rowsOf(t)
        const F = flt[t] || NO_FLT
        const setF = (patch: Partial<Flt>) => setFlt((x) => ({ ...x, [t]: { ...(x[t] || NO_FLT), ...patch } }))
        const people = [...new Set(all.flatMap((r) => PERSON_FILTER[t].of(r.m)).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
        const q = normalizeVi(F.q)
        const rows = all.filter((r) =>
          (!F.who || PERSON_FILTER[t].of(r.m).some((x) => normalizeVi(x) === normalizeVi(F.who))) &&
          (!F.from || r.m.date >= F.from) && (!F.to || r.m.date <= F.to) &&
          (!q || normalizeVi([r.m.so || '', ...COLS[t].map(([, get]) => get(r))].join(' ')).includes(q)))
        const filtering = !!(F.q || F.who || F.from || F.to)
        // Cột "Phiếu ký": loại phiếu phải in ký (Sửa giao diện) hoặc đã có phiếu ký / chờ ký từ trước
        const showSign = !!S.photo.sign[t] || all.some((r) => r.m.signed?.length || r.m.signPending)
        return (
          <section key={t} className="bg-gray-900 border border-gray-800 rounded-xl mb-4">
            <FoldHead open={!!open[t]} onClick={() => toggle(t)} title={MOVE_DEFS[t].history} count={filtering ? `${rows.length} / ${all.length} phiếu (đang lọc)` : `${all.length} phiếu`} />
            {open[t] && <div className="px-5 pb-5">
              {all.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 mb-3">
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input value={F.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Tìm số phiếu, người, lý do, ghi chú…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                  <select value={F.who} onChange={(e) => setF({ who: e.target.value })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="">{PERSON_FILTER[t].label}: Tất cả</option>
                    {people.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <div className="w-40"><div className="text-[11px] text-gray-500 mb-0.5">Từ ngày</div><DatePicker value={F.from} onChange={(v) => setF({ from: v })} placeholder="Từ ngày" /></div>
                  <div className="w-40"><div className="text-[11px] text-gray-500 mb-0.5">Đến ngày</div><DatePicker value={F.to} onChange={(v) => setF({ to: v })} placeholder="Đến ngày" /></div>
                  {filtering && (
                    <button type="button" onClick={() => setFlt((x) => ({ ...x, [t]: NO_FLT }))}
                      className="flex items-center gap-1 border border-gray-700 hover:border-gray-500 text-gray-300 px-3 py-2 rounded-lg text-sm"><X size={14} /> Xoá lọc</button>
                  )}
                  <span className="text-xs text-gray-500 ml-auto self-center">Đang hiện {rows.length} / {all.length} phiếu</span>
                </div>
              )}
              <div className="overflow-x-auto border border-gray-800 rounded-lg">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-800 bg-gray-800/30">
                    <th className="px-3 py-2">Số phiếu</th>
                    {COLS[t].map(([h]) => <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>)}
                    <th className="px-3 py-2 whitespace-nowrap">Ảnh</th>
                    {showSign && <th className="px-3 py-2 whitespace-nowrap">Phiếu ký</th>}
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((r) => (
                    <tr key={r.m.id} className="border-b border-gray-800/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-blue-300 whitespace-nowrap">{r.m.so || <span className="text-gray-500">dữ liệu cũ</span>}</td>
                      {COLS[t].map(([h, get]) => <td key={h} className="px-3 py-2">{get(r) || <span className="text-gray-600">—</span>}</td>)}
                      <td className="px-3 py-2"><PhotoCell photos={r.m.photos} caption={`phiếu ${r.m.so || 'cũ'} · ảnh thiết bị`} onView={setLb} /></td>
                      {showSign && <td className="px-3 py-2"><SignStatus move={r.m} canWrite={canWrite} onView={setLb} onSigned={(nm) => setMoves((ms) => ms.map((x) => (x.id === nm.id ? nm : x)))} /></td>}
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button title="In lại phiếu" onClick={() => setPreview(r.m)} className="text-gray-400 hover:text-white p-1"><Printer size={14} /></button>
                        {isAdmin && <button title="Xoá phiếu (Admin)" onClick={() => removeMove(r.m)} className="text-gray-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                  )) : <tr><td colSpan={COLS[t].length + (showSign ? 4 : 3)} className="px-3 py-5 text-center text-gray-500 text-sm">{all.length ? 'Không có phiếu nào khớp bộ lọc' : 'Chưa có dòng nào'}</td></tr>}
                </tbody>
              </table>
            </div></div>}
          </section>
        )
      })}

      {/* ===== Công việc gắn thiết bị này (10/10/2026) ===== */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl mb-4">
        <FoldHead open={!!open.tasks} onClick={() => toggle('tasks')} title="Công việc của thiết bị" count={`${devTasks.length} việc`}
          extra={<span className="text-xs text-gray-500">sửa chữa, bảo hành, cài đặt… gắn đúng mã này</span>} />
        {open.tasks && <div className="px-5 pb-5">
          {devTasks.length ? devTasks.map((t) => {
            const st = computeTaskStatus(t.dueDate, t.completed)
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 border-b border-gray-800/60 last:border-0 py-2 text-sm">
                <span className="text-gray-300 w-20">{TASK_TYPE_LABEL[t.type] || t.type}</span>
                <Link href="/dashboard/tasks" className="flex-1 min-w-[180px] hover:text-blue-400">{t.title}</Link>
                <span className="text-gray-400">{t.assigneeName || 'Chưa phân công'}</span>
                <span className="text-gray-500 font-mono text-xs">{fmtDate(t.dueDate)}</span>
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${TASK_STATUS_COLOR[st]}`}>{TASK_STATUS_LABEL[st]}</span>
              </div>
            )
          }) : <p className="text-sm text-gray-500">Chưa có công việc nào gắn thiết bị này.</p>}
          {canWrite && <Link href={`/dashboard/tasks/new?deviceId=${device.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Wrench size={13} /> Tạo công việc cho thiết bị này</Link>}
        </div>}
      </section>

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
              {holders.map((h) => {
                const empId = empIds.get(normalizeVi(h.name))
                return (
                  <div key={h.key} className="flex flex-wrap items-center gap-2 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                    <User size={14} className="text-blue-400" />
                    {empId ? <Link href={`/dashboard/employees/${empId}`} className="hover:text-blue-400 hover:underline">{h.name}</Link> : h.name}
                    {h.pb && <span className="text-gray-500 text-xs">· {h.pb}</span>}
                    <b className="font-mono text-green-400">{h.qty}</b>
                    {canWrite && <>
                      <span className="w-px h-4 bg-gray-700 mx-1" />
                      <button onClick={() => setPhieu({ type: 'TH', person: h.name })} className="text-xs text-amber-300 hover:underline">Thu hồi</button>
                      <button onClick={() => setPhieu({ type: 'LC', person: h.name })} className="text-xs text-purple-300 hover:underline">Chuyển</button>
                    </>}
                  </div>
                )
              })}
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
      {lb && <PhotoLightbox lb={lb} onClose={() => setLb(null)} />}
      {phieu && (
        <PhieuModal type={phieu.type} presetDeviceId={device.id} presetPerson={phieu.person} onClose={() => setPhieu(null)}
          onSaved={(m, x) => {
            setPhieu(null); load()
            if (x?.repairCreated) fetch('/api/tasks').then((r) => r.json()).then((j) => setDevTasks(((j.data || []) as Task[]).filter((t) => t.deviceId === id))).catch(() => {})
            setMsg({ ok: true, text: `Đã lưu phiếu ${m.so}${x?.repairCreated ? ` · đã tạo ${x.repairCreated} Công việc Sửa chữa` : ''}${x?.signPending ? ' · Chờ ký — in ra ký xong tải ảnh phiếu lên' : ''}` }); setTimeout(() => setMsg(null), 3500)
          }} />
      )}

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

// Ô nhập trường bổ sung (Sửa giao diện) theo kiểu: Chữ / Số / Ngày / Lựa chọn
function ExtraInput({ field, value, onChange, disabled, className }: { field: ExtraField; value: string; onChange: (v: string) => void; disabled: boolean; className: string }) {
  if (field.type === 'date') return disabled ? <div className="text-sm py-2">{fmtDate(value)}</div> : <DatePicker value={value} onChange={onChange} />
  if (field.type === 'select') return (
    <select className={className} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {value && !field.options.includes(value) && <option value={value}>{value}</option>}
      {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  return <input className={className} disabled={disabled} inputMode={field.type === 'number' ? 'decimal' : undefined} value={value}
    onChange={(e) => onChange(field.type === 'number' ? e.target.value.replace(/[^\d.,-]/g, '') : e.target.value)} />
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
