'use client'
// Popup lập phiếu Nhập kho / Cấp phát / Thu hồi / Luân chuyển — đúng demo Sếp duyệt 30/09/2026:
//  • Ngày điền sẵn hôm nay, bấm chọn ngày khác được; tên người + phòng ban gõ tay
//  • Mã tài sản: gõ 2-3 ký tự → gợi ý từ Danh mục; mã ngoài danh mục → popup chặn, không cho lưu
//  • Số lượng chỉ nhận số nguyên ≥ 1; Tình trạng chọn từ danh sách; 1 phiếu nhiều thiết bị
//  • Cấp phát vượt tồn / thu hồi, luân chuyển vượt số đang cấp → chặn (server kiểm tra lại lần nữa)
//  • 3 nút: Lưu · In (in thử, chưa lưu) · Lưu và in
// Liên kết chức năng (Sếp duyệt demo 10/10/2026):
//  • Nhập kho là cửa vào: gõ mã chưa có → "Khai báo thiết bị mới" ngay trong dòng (đủ Loại, Hãng,
//    Model, thông số bắt buộc), "Nhân bản dòng" cho nhiều máy cùng model
//  • Nhập kho thiết bị cũ thiếu thông số bắt buộc → phải điền nốt mới lưu được
//  • Mọi phiếu: chọn mã là hiện thông số đi kèm (chỉ xem, đã khoá)
//  • Thu hồi / Luân chuyển: gõ tên người → hiện thiết bị người đó đang giữ, bấm là thêm vào phiếu
//  • Tên người gợi ý từ danh sách Nhân viên (HPcore), khớp tên thì tự điền phòng ban (vẫn gõ tay được)
//  • Thu hồi tình trạng "Hư" → tick sẵn "Tạo Công việc Sửa chữa" cho thiết bị đó
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Trash2, Printer, Save, Lock, Copy, TriangleAlert } from 'lucide-react'
import DatePicker from '@/components/DatePicker'
import { ASSET_CODE_MAX, MOVE_DEFS, TAX_CODE_RE, normalizeVi, todayIso, type MoveType } from '@/lib/kho/config'
import { deviceNameS, missingSpecs, specFieldsOf, type KhoSettings } from '@/lib/kho/settings'
import { useKhoSettings } from '@/lib/kho/useKhoSettings'
import type { DeviceCategory } from '@/lib/types'
import { PrintPreview, type PrintableMove } from '@/components/kho/PhieuPrint'

export interface CatalogDevice {
  id: string; asset_code: string; category: DeviceCategory; brand: string; model: string
  serial_number?: string | null; stock: { left: number; held: number }
  specs?: Record<string, string>
  spec_lock?: { so: string | null; at: string; via: string } | null
}

interface NewDev { category: string; brand: string; model: string; serial: string; warrantyFrom: string; warrantyExpiry: string; specs: Record<string, string> }
interface Line {
  code: string; deviceId: string; qty: string; condition: string; note: string
  isNew: boolean; nd: NewDev // khai báo thiết bị mới (chỉ Nhập kho)
  fill: Record<string, string> // điền nốt thông số còn trống (Nhập kho thiết bị cũ)
  repair: boolean // Thu hồi "Hư" → tạo Công việc Sửa chữa
}

const emptyNd = (): NewDev => ({ category: '', brand: '', model: '', serial: '', warrantyFrom: '', warrantyExpiry: '', specs: {} })
const newLine = (type: MoveType, d?: CatalogDevice): Line => ({
  code: d?.asset_code || '', deviceId: d?.id || '', qty: '1', condition: type === 'NK' ? 'Mới' : '', note: '',
  isNew: false, nd: emptyNd(), fill: {}, repair: true,
})

// Thẻ thông số đi kèm 1 thiết bị (chỉ xem) — dùng ở mọi phiếu
export function SpecChips({ S, d, max }: { S: KhoSettings; d: { category: string; specs?: Record<string, string> }; max?: number }) {
  const fields = specFieldsOf(S, d.category).filter((f) => String(d.specs?.[f.key] ?? '').trim())
  if (!fields.length) return <span className="text-xs text-gray-500">{specFieldsOf(S, d.category).length ? 'Chưa có thông số' : 'Loại này không có thông số riêng'}</span>
  const show = max ? fields.slice(0, max) : fields
  return (
    <>
      {show.map((f) => (
        <span key={f.key} className="text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-0.5"><span className="text-gray-500">{f.label}:</span> {d.specs![f.key]}</span>
      ))}
      {max && fields.length > max && <span className="text-xs text-gray-500 px-1 py-0.5">+{fields.length - max} thông số</span>}
    </>
  )
}

export default function PhieuModal({ type, presetDeviceId, presetPerson, onClose, onSaved }: {
  type: MoveType
  presetDeviceId?: string
  presetPerson?: string // Thu hồi / Luân chuyển: người đang giữ · Cấp phát: người nhận
  onClose: () => void
  onSaved: (move: { id: string; so: string | null }, extra?: { repairCreated?: number }) => void
}) {
  const def = MOVE_DEFS[type]
  // Tình trạng, tên Loại, ô "Theo đề nghị" theo "Sửa giao diện"
  const { settings } = useKhoSettings()
  const deviceName = (d: { category: string; brand?: string | null; model?: string | null }) => deviceNameS(settings, d)
  const [catalog, setCatalog] = useState<CatalogDevice[]>([])
  const [loadingCat, setLoadingCat] = useState(true)
  const [emps, setEmps] = useState<{ name: string; pb: string }[]>([])
  const [date, setDate] = useState(todayIso())
  // Người có sẵn (bấm Thu hồi / Chuyển / Cấp phát cho … từ trang khác) → điền sẵn tên
  const [info, setInfo] = useState<Record<string, string>>(() => (presetPerson ? { nguoi: presetPerson } : {} as Record<string, string>))
  const [dnSo, setDnSo] = useState('')
  const [dnDate, setDnDate] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine(type)])
  const [errs, setErrs] = useState<Record<string, boolean>>({})
  const [alert, setAlert] = useState<{ icon: string; title: string; body: React.ReactNode } | null>(null)
  const [sugFor, setSugFor] = useState<number | null>(null)
  const [sugIdx, setSugIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ move: PrintableMove; draft: boolean; afterClose?: () => void } | null>(null)
  const [holdings, setHoldings] = useState<{ name: string; list: { deviceId: string; assetCode: string; qty: number }[] } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const autoPb = useRef<Record<string, string>>({})
  const personMode = type === 'TH' || type === 'LC'

  // Danh mục tải 1 lần khi mở popup (API có cache 30s) → gõ tìm tại chỗ, không tốn thêm lượt đọc
  useEffect(() => {
    fetch('/api/devices').then((r) => r.json()).then((j) => {
      const list = (j.data || []) as CatalogDevice[]
      setCatalog(list)
      if (presetDeviceId) {
        const d = list.find((x) => x.id === presetDeviceId)
        if (d) setLines([newLine(type, d)])
      }
      setLoadingCat(false)
    })
  }, [presetDeviceId, type])

  // Gợi ý tên người từ Nhân viên (HPcore, API có cache) — chỉ phiếu có người nhận / giao
  useEffect(() => {
    if (type === 'NK') return
    fetch('/api/employees').then((r) => r.json()).then((j) => {
      const list = ((j.data || []) as { full_name: string; department?: { name: string } | null }[]).map((e) => ({ name: e.full_name, pb: e.department?.name || '' }))
      setEmps(list)
      // Tên đã có trước khi danh sách tải xong (điền sẵn / gõ nhanh) → tự điền phòng ban còn trống
      setInfo((x) => {
        const n = { ...x }
        for (const [k, pk] of [['nguoi', 'pb'], ['nguoi2', 'pb2']] as const) {
          const e = x[k] && list.find((y) => normalizeVi(y.name) === normalizeVi(x[k]))
          if (e && e.pb && !x[pk]) { n[pk] = e.pb; autoPb.current[pk] = e.pb }
        }
        return n
      })
    }).catch(() => {})
  }, [type])

  // Thu hồi / Luân chuyển: thiết bị người đó đang giữ (gõ xong 0,5s mới hỏi máy chủ)
  const holderName = personMode ? (info.nguoi || '').trim() : ''
  useEffect(() => {
    if (!holderName || holderName.length < 3) return
    const t = setTimeout(() => {
      fetch(`/api/moves?holder=${encodeURIComponent(holderName)}`).then((r) => r.json()).then((j) => setHoldings({ name: holderName, list: j.data || [] })).catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [holderName])

  const byCode = useMemo(() => new Map(catalog.map((d) => [normalizeVi(d.asset_code), d])), [catalog])
  const byId = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog])
  const findCode = (code: string) => byCode.get(normalizeVi(code))

  const suggestions = (q: string) => {
    const k = normalizeVi(q)
    if (k.length < 2) return []
    return catalog.filter((d) => [d.asset_code, d.brand, d.model, d.serial_number || ''].some((x) => normalizeVi(x).includes(k))).slice(0, 8)
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))
    setErrs((e) => { const n = { ...e }; Object.keys(patch).forEach((p) => delete n[p + i]); return n })
  }
  const clearErr = (k: string) => setErrs((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n })
  function setNd(i: number, patch: Partial<NewDev>) {
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, nd: { ...l.nd, ...patch } } : l)))
    Object.keys(patch).forEach((p) => clearErr(`nd_${p}${i}`))
  }
  function pick(i: number, d: CatalogDevice) { setLine(i, { code: d.asset_code, deviceId: d.id, isNew: false }); setSugFor(null) }
  function startNew(i: number) { setLine(i, { isNew: true, deviceId: '' }); setSugFor(null) }
  function duplicate(i: number) {
    const src = lines[i]
    setLines((ls) => [...ls.slice(0, i + 1), { ...newLine(type), isNew: true, qty: src.qty, condition: src.condition, nd: { ...src.nd, serial: '', specs: { ...src.nd.specs } } }, ...ls.slice(i + 1)])
  }
  function addHolding(h: { deviceId: string; assetCode: string; qty: number }) {
    if (lines.some((l) => l.deviceId === h.deviceId)) return
    const d = byId.get(h.deviceId)
    const empty = lines.findIndex((l) => !l.code.trim())
    const line = { ...newLine(type, d), code: d?.asset_code || h.assetCode, deviceId: h.deviceId, qty: String(h.qty) }
    setLines((ls) => (empty >= 0 ? ls.map((l, k) => (k === empty ? line : l)) : [...ls, line]))
  }
  function setPerson(key: string, v: string) {
    const pbKey = key === 'nguoi2' ? 'pb2' : 'pb'
    const e = type !== 'NK' && emps.find((x) => normalizeVi(x.name) === normalizeVi(v))
    setInfo((x) => {
      const n = { ...x, [key]: v }
      // Tự điền phòng ban khi khớp tên — không đè phòng ban người dùng đã tự gõ
      if (e && e.pb && (!x[pbKey] || x[pbKey] === autoPb.current[pbKey])) { n[pbKey] = e.pb; autoPb.current[pbKey] = e.pb }
      return n
    })
    clearErr(key); if (e) clearErr(pbKey)
  }

  // Kiểm tra tại chỗ (server kiểm tra lại trong transaction)
  function validate(): boolean {
    const e: Record<string, boolean> = {}
    const msgs: string[] = []
    if (!date) { e.date = true; msgs.push('Chưa chọn ngày') }
    def.fields.forEach((f) => {
      const v = String(info[f.key] || '').trim()
      if (f.required && !v) { e[f.key] = true; msgs.push('Chưa nhập ' + f.label.toLowerCase()) }
      else if (v && f.kind === 'tax' && !TAX_CODE_RE.test(v)) { e[f.key] = true; msgs.push(f.label + ' phải gồm 10 số (chi nhánh: 10 số-3 số)') }
    })
    if (type === 'LC' && info.nguoi?.trim() && normalizeVi(info.nguoi) === normalizeVi(info.nguoi2 || '')) { e.nguoi2 = true; msgs.push('Người nhận phải khác người chuyển') }
    const bad: string[] = []
    const sum = new Map<string, number>()
    const newCodes = new Map<string, number>()
    lines.forEach((l, i) => {
      const d = l.code.trim() ? findCode(l.code) : undefined
      if (!l.code.trim()) { e['code' + i] = true; msgs.push(`Dòng ${i + 1}: chưa nhập mã tài sản`) }
      else if (!d && type === 'NK' && l.isNew) {
        const k = normalizeVi(l.code)
        if (newCodes.has(k)) { e['code' + i] = true; msgs.push(`Dòng ${i + 1}: mã ${l.code.trim()} trùng với dòng ${newCodes.get(k)}`) }
        newCodes.set(k, i + 1)
        if (!l.nd.category) { e['nd_category' + i] = true; msgs.push(`Dòng ${i + 1}: chưa chọn Loại`) }
        if (!l.nd.brand.trim()) { e['nd_brand' + i] = true; msgs.push(`Dòng ${i + 1}: chưa nhập Hãng`) }
        if (!l.nd.model.trim()) { e['nd_model' + i] = true; msgs.push(`Dòng ${i + 1}: chưa nhập Model`) }
        if (l.nd.category) {
          const miss = missingSpecs(settings, l.nd.category, l.nd.specs)
          miss.forEach((f) => (e[`spec_${f.key}${i}`] = true))
          if (miss.length) msgs.push(`Dòng ${i + 1}: thiếu thông số ${miss.map((f) => f.label).join(', ')}`)
        }
      } else if (!d && type === 'NK') { e['code' + i] = true; msgs.push(`Dòng ${i + 1}: mã ${l.code.trim()} chưa có — bấm "Khai báo thiết bị mới"`) }
      else if (!d) { e['code' + i] = true; bad.push(l.code.trim()) }
      if (d && type === 'NK') {
        const miss = missingSpecs(settings, d.category, { ...(d.specs || {}), ...l.fill })
        miss.forEach((f) => (e[`spec_${f.key}${i}`] = true))
        if (miss.length) msgs.push(`Dòng ${i + 1}: ${d.asset_code} còn thiếu thông số ${miss.map((f) => f.label).join(', ')}`)
      }
      const n = Number(l.qty)
      if (!/^\d+$/.test(l.qty.trim()) || n < 1) { e['qty' + i] = true; msgs.push(`Dòng ${i + 1}: số lượng phải là số nguyên từ 1 trở lên`) }
      if (!l.condition) { e['condition' + i] = true; msgs.push(`Dòng ${i + 1}: chưa chọn tình trạng`) }
      if (d && n >= 1) sum.set(d.id, (sum.get(d.id) || 0) + n)
    })
    for (const [id, n] of sum) {
      const d = byId.get(id)!
      if (type === 'XK' && n > d.stock.left) msgs.push(`${d.asset_code}: chỉ còn ${d.stock.left} trong kho`)
      if ((type === 'TH' || type === 'LC') && n > d.stock.held) msgs.push(`${d.asset_code}: đang cấp ra ngoài ${d.stock.held}, không ${type === 'TH' ? 'thu hồi' : 'chuyển'} ${n} được`)
    }
    setErrs(e)
    if (bad.length) {
      setAlert({ icon: '⛔', title: 'Mã thiết bị không có trong danh mục', body: <>Mã <b>{bad.join(', ')}</b> không có trong Danh mục thiết bị. Thiết bị mới phải đi qua Nhập kho — không thể {def.label.toLowerCase()} mã này.</> })
      return false
    }
    if (msgs.length) { setAlert({ icon: '⚠', title: 'Còn thiếu / sai thông tin', body: <>{msgs.map((m, k) => <div key={k}>{m}</div>)}</> }); return false }
    return true
  }

  function toPrintable(so: string | null): PrintableMove {
    return {
      type, so, date, dnSo: dnSo.trim() || null, dnDate: dnDate || null,
      info: Object.fromEntries(def.fields.map((f) => [f.key, String(info[f.key] || '').trim()])),
      lines: lines.map((l) => {
        const d = findCode(l.code)
        if (!d) return { assetCode: l.code.trim(), name: deviceName(l.nd), serial: l.nd.serial.trim() || null, qty: Number(l.qty), condition: l.condition, note: l.note.trim() || null }
        return { assetCode: d.asset_code, name: deviceName(d), serial: d.serial_number || null, qty: Number(l.qty), condition: l.condition, note: l.note.trim() || null }
      }),
    }
  }

  async function save(thenPrint: boolean) {
    if (!validate() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, date, info, dnSo: dnSo.trim() || null, dnDate: dnDate || null,
          lines: lines.map((l) => {
            const d = findCode(l.code)
            const base = { qty: Number(l.qty), condition: l.condition, note: l.note.trim() || null }
            if (!d) return { ...base, newDevice: { assetCode: l.code.trim(), category: l.nd.category, brand: l.nd.brand, model: l.nd.model, serialNumber: l.nd.serial || null, warrantyFrom: l.nd.warrantyFrom || null, warrantyExpiry: l.nd.warrantyExpiry || null, specs: l.nd.specs } }
            return { ...base, deviceId: d.id, ...(type === 'NK' && Object.keys(l.fill).length ? { fillSpecs: l.fill } : {}) }
          }),
          repairTasks: type === 'TH' ? lines.filter((l) => l.condition === 'Hư' && l.repair).map((l) => findCode(l.code)?.id).filter(Boolean) : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setAlert({ icon: '⚠', title: 'Chưa lưu được phiếu', body: json.error || 'Lỗi không xác định' }); return }
      const extra = { repairCreated: json.repairCreated || 0 }
      if (thenPrint) setPreview({ move: toPrintable(json.data.so), draft: false, afterClose: () => onSaved(json.data, extra) })
      else onSaved(json.data, extra)
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500'
  const bd = (k: string) => (errs[k] ? 'border-red-500' : 'border-gray-700')
  const small = 'w-full bg-gray-800 border rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500'

  // Ô nhập thông số theo Loại (khai báo mới / điền nốt)
  const specInputs = (i: number, category: string, values: Record<string, string>, onChange: (k: string, v: string) => void, onlyEmptyOf?: Record<string, string>) => {
    const fields = specFieldsOf(settings, category).filter((f) => !onlyEmptyOf || !String(onlyEmptyOf[f.key] ?? '').trim())
    if (!fields.length) return <p className="text-xs text-gray-500">Loại này chưa có trường thông số (Admin thêm ở Sửa giao diện).</p>
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-[11px] text-gray-400 mb-0.5">{f.label}{f.required && <b className="text-red-400"> *</b>}</label>
            <input className={`${small} ${bd(`spec_${f.key}${i}`)}`} value={values[f.key] || ''} onChange={(e) => { onChange(f.key, e.target.value); clearErr(`spec_${f.key}${i}`) }} />
          </div>
        ))}
      </div>
    )
  }

  // Phần dưới mỗi dòng: thông số đi kèm / điền nốt / khai báo thiết bị mới
  function lineDetail(l: Line, i: number) {
    const d = l.code.trim() ? findCode(l.code) : undefined
    if (d) {
      const miss = missingSpecs(settings, d.category, d.specs)
      return (
        <>
          <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-blue-300">
              <Lock size={13} /> Thông số kĩ thuật đi kèm (chỉ xem)
              {miss.length
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-500/40 text-amber-400"><TriangleAlert size={12} /> Thiếu {miss.length} thông số bắt buộc</span>
                : d.spec_lock ? <span className="px-2 py-0.5 rounded border border-blue-500/40">Khoá {d.spec_lock.so ? `theo phiếu ${d.spec_lock.so}` : 'từ lúc thêm / bổ sung'}</span> : null}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5"><SpecChips S={settings} d={d} /></div>
          </div>
          {type === 'NK' && miss.length > 0 && (
            <div className="mt-2 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 p-3">
              <div className="text-sm text-amber-300 mb-2"><b>Thiết bị chưa đủ thông số.</b> <span className="text-xs text-amber-200/80">Điền nốt ô trống thì mới nhập kho được (ô * bắt buộc). Ô đã có giữ nguyên khoá.</span></div>
              {specInputs(i, d.category, l.fill, (k, v) => setLine(i, { fill: { ...l.fill, [k]: v } }), d.specs || {})}
            </div>
          )}
          {type !== 'NK' && miss.length > 0 && <div className="text-xs text-amber-300 mt-1">⚠ Thiết bị chưa đủ thông số — nên bổ sung ở trang chi tiết (không chặn phiếu này).</div>}
          {type === 'TH' && l.condition === 'Hư' && (
            <label className="mt-2 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-1.5 cursor-pointer">
              <input type="checkbox" checked={l.repair} onChange={(e) => setLine(i, { repair: e.target.checked })} className="accent-red-500" />
              Tạo <b>Công việc Sửa chữa</b> cho {d.asset_code} khi lưu phiếu (gắn đúng mã, chờ phân công)
            </label>
          )}
        </>
      )
    }
    if (type !== 'NK') return null
    // Mã chưa có (đang gõ thì để danh sách gợi ý lo) → nút khai báo; dòng đã khai báo (kể cả dòng
    // nhân bản chưa gõ mã) → hiện luôn khung thiết bị mới
    if (!l.isNew && (!l.code.trim() || sugFor === i)) return null
    if (!l.isNew) return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-amber-300">
        Mã <b className="font-mono">{l.code.trim()}</b> chưa có trong Danh mục.
        <button type="button" onClick={() => startNew(i)} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"><Plus size={14} /> Khai báo thiết bị mới với mã này</button>
      </div>
    )
    const N = l.nd
    return (
      <div className="rounded-lg border border-dashed border-violet-500/70 bg-violet-500/5 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[11px] font-bold text-white bg-violet-600 rounded px-1.5 py-0.5">THIẾT BỊ MỚI</span>
          {l.code.trim() ? <b className="font-mono">{l.code.trim()}</b> : <span className="text-amber-300 text-sm">gõ mã tài sản cho máy này ở ô bên trên</span>}
          <span className="text-xs text-gray-400 flex items-center gap-1">khai đủ 1 lần · lưu phiếu xong thông số tự khoá <Lock size={11} /></span>
          <span className="flex-1" />
          <button type="button" onClick={() => duplicate(i)} title="Nhập nhiều máy cùng model: chép Loại, Hãng, Model, thông số sang dòng mới — chỉ cần gõ mã + seri"
            className="flex items-center gap-1.5 border border-gray-600 hover:border-violet-400 px-2.5 py-1 rounded-lg text-xs"><Copy size={13} /> Nhân bản dòng (cùng model)</button>
          <button type="button" onClick={() => setLine(i, { isNew: false, nd: emptyNd() })} className="border border-gray-600 hover:border-gray-400 px-2.5 py-1 rounded-lg text-xs text-gray-300">Bỏ khai báo</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-x-3 gap-y-2">
          <div>
            <label className="block text-[11px] text-gray-400 mb-0.5">{settings.fieldLabels.category} <b className="text-red-400">*</b></label>
            <select className={`${small} ${bd('nd_category' + i)}`} value={N.category} onChange={(e) => setNd(i, { category: e.target.value, specs: {} })}>
              <option value="">— chọn —</option>
              {settings.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div><label className="block text-[11px] text-gray-400 mb-0.5">{settings.fieldLabels.brand} <b className="text-red-400">*</b></label><input className={`${small} ${bd('nd_brand' + i)}`} value={N.brand} onChange={(e) => setNd(i, { brand: e.target.value })} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-0.5">{settings.fieldLabels.model} <b className="text-red-400">*</b></label><input className={`${small} ${bd('nd_model' + i)}`} value={N.model} onChange={(e) => setNd(i, { model: e.target.value })} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-0.5">{settings.fieldLabels.serial_number}</label><input className={`${small} border-gray-700`} value={N.serial} onChange={(e) => setNd(i, { serial: e.target.value })} /></div>
          <div><label className="block text-[11px] text-gray-400 mb-0.5">Bảo hành từ</label><DatePicker value={N.warrantyFrom} onChange={(v) => setNd(i, { warrantyFrom: v })} placeholder="Không bắt buộc" /></div>
          <div><label className="block text-[11px] text-gray-400 mb-0.5">Bảo hành đến</label><DatePicker value={N.warrantyExpiry} onChange={(v) => setNd(i, { warrantyExpiry: v })} placeholder="Không bắt buộc" /></div>
        </div>
        {N.category
          ? <><div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-3 mb-2">Thông số kĩ thuật · {settings.categories.find((c) => c.key === N.category)?.label}</div>
              {specInputs(i, N.category, N.specs, (k, v) => setNd(i, { specs: { ...N.specs, [k]: v } }))}</>
          : <p className="text-xs text-gray-500 mt-2">Chọn Loại để hiện các ô thông số của loại đó.</p>}
      </div>
    )
  }

  const heldChips = personMode && holderName.length >= 3 && holdings && normalizeVi(holdings.name) === normalizeVi(holderName) ? holdings.list : null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8" onMouseDown={(e) => { if (sugFor !== null && boxRef.current && !(e.target as HTMLElement).closest('[data-ac]')) setSugFor(null) }}>
      <div ref={boxRef} className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-lg">Thêm {def.label.toLowerCase()}</h2>
          <span className="text-xs text-gray-500">số phiếu tự cấp khi Lưu</span>
          <span className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ngày <b className="text-red-400">*</b></label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            {def.fields.map((f) => {
              const person = type !== 'NK' && (f.key === 'nguoi' || f.key === 'nguoi2')
              return (
                <div key={f.key} className={f.wide ? 'md:col-span-2' : ''}>
                  <label className="block text-xs text-gray-400 mb-1">{f.label}{f.required && <b className="text-red-400"> *</b>}</label>
                  <input className={`${input} ${bd(f.key)}`} value={info[f.key] || ''} list={person ? 'phieu-emps' : undefined}
                    placeholder={f.kind === 'tax' ? 'VD 0312345678 (không bắt buộc)' : person ? 'Gõ tên — gợi ý từ danh sách Nhân viên' : 'Gõ tay'}
                    inputMode={f.kind === 'tax' ? 'numeric' : undefined} maxLength={f.kind === 'tax' ? 14 : undefined}
                    onChange={(e) => {
                      if (person) { setPerson(f.key, e.target.value); return }
                      const v = f.kind === 'tax' ? e.target.value.replace(/[^\d-]/g, '') : e.target.value
                      setInfo({ ...info, [f.key]: v }); clearErr(f.key)
                    }} />
                </div>
              )
            })}
            {settings.print.showDN && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Theo đề nghị số</label>
                  <input className={`${input} border-gray-700`} value={dnSo} onChange={(e) => setDnSo(e.target.value)} placeholder="VD 000000163 (không bắt buộc)" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ngày đề nghị</label>
                  <DatePicker value={dnDate} onChange={setDnDate} placeholder="Không bắt buộc" />
                </div>
              </>
            )}
          </div>
          {type !== 'NK' && <datalist id="phieu-emps">{emps.map((e) => <option key={e.name} value={e.name}>{e.pb}</option>)}</datalist>}

          {personMode && (
            !holderName ? <div className="text-xs text-gray-500">Gõ tên người {type === 'TH' ? 'giao trả' : 'chuyển'} → hiện thiết bị người đó đang giữ để bấm thêm vào phiếu.</div>
            : heldChips ? (
              heldChips.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400">{holderName} đang giữ:</span>
                  {heldChips.map((h) => {
                    const d = byId.get(h.deviceId)
                    const added = lines.some((l) => l.deviceId === h.deviceId || (d && normalizeVi(l.code) === normalizeVi(d.asset_code)))
                    return (
                      <button key={h.deviceId} type="button" disabled={added} onClick={() => addHolding(h)}
                        className="text-xs border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/25 text-blue-200 rounded-full px-2.5 py-1 disabled:opacity-40">
                        {added ? '✓' : '＋'} {h.assetCode}{d ? ` · ${d.brand} ${d.model}` : ''} ×{h.qty}
                      </button>
                    )
                  })}
                </div>
              ) : <div className="text-xs text-amber-300">{holderName} không giữ thiết bị nào (kiểm tra lại tên).</div>
            ) : null
          )}

          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h3 className="font-semibold text-sm">Thiết bị</h3>
              <span className="text-xs text-gray-500">{loadingCat ? 'Đang tải danh mục…' : `1 phiếu ghi được nhiều thiết bị · danh mục ${catalog.length} mã${type === 'NK' ? ' · gõ mã chưa có → khai báo thiết bị mới ngay tại đây' : ' · chọn mã là hiện thông số đi kèm'}`}</span>
            </div>
            <div className="border border-gray-800 rounded-xl overflow-x-auto lg:overflow-visible">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-800">
                    <th className="px-3 py-2 w-10">STT</th>
                    <th className="px-3 py-2 min-w-[190px]">Mã tài sản <b className="text-red-400">*</b></th>
                    <th className="px-3 py-2">Tên thiết bị</th>
                    <th className="px-3 py-2 w-24">Số lượng <b className="text-red-400">*</b></th>
                    <th className="px-3 py-2 w-44">Tình trạng <b className="text-red-400">*</b></th>
                    <th className="px-3 py-2">Ghi chú</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                {lines.map((l, i) => {
                  const d = l.code.trim() ? findCode(l.code) : undefined
                  const sug = sugFor === i ? suggestions(l.code) : []
                  const canNew = type === 'NK' && !d && l.code.trim().length >= 2
                  const over = d && ((type === 'XK' && Number(l.qty) > d.stock.left) || ((type === 'TH' || type === 'LC') && Number(l.qty) > d.stock.held))
                  const detail = lineDetail(l, i)
                  return (
                    <tbody key={i} className="border-b border-gray-800/60 last:border-0">
                      <tr className="align-top">
                        <td className="px-3 py-2 text-gray-500 text-center pt-4">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="relative" data-ac>
                            <input className={`${input} ${bd('code' + i)} font-mono`} value={l.code} placeholder="Gõ 2-3 ký tự…" autoComplete="off" maxLength={ASSET_CODE_MAX}
                              onChange={(e) => { setLine(i, { code: e.target.value, deviceId: '' }); setSugFor(i); setSugIdx(0) }}
                              onFocus={() => { setSugFor(i); setSugIdx(0) }}
                              onKeyDown={(e) => {
                                if (!sug.length) {
                                  // Chỉ còn lựa chọn "Khai báo thiết bị mới": Enter = khai báo, Esc = đóng gợi ý
                                  if (e.key === 'Enter' && canNew) { e.preventDefault(); startNew(i) }
                                  if (e.key === 'Escape') setSugFor(null)
                                  return
                                }
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx((sugIdx + 1) % sug.length) }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setSugIdx((sugIdx - 1 + sug.length) % sug.length) }
                                if (e.key === 'Enter') { e.preventDefault(); pick(i, sug[sugIdx] || sug[0]) }
                                if (e.key === 'Escape') setSugFor(null)
                              }} />
                            {sugFor === i && normalizeVi(l.code).length >= 2 && (
                              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-64 overflow-auto min-w-[260px]">
                                {sug.map((s, k) => (
                                  <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(i, s) }}
                                    className={`w-full text-left px-3 py-2 text-sm ${k === sugIdx ? 'bg-blue-600/30' : 'hover:bg-gray-700'}`}>
                                    <b className="font-mono">{s.asset_code}</b> <span className="text-gray-400 text-xs">{deviceName(s)}</span>
                                  </button>
                                ))}
                                {!sug.length && !canNew && <div className="px-3 py-2 text-sm text-gray-400">Không có mã nào khớp trong Danh mục</div>}
                                {canNew && (
                                  <button type="button" onMouseDown={(e) => { e.preventDefault(); startNew(i) }}
                                    className="w-full text-left px-3 py-2 text-sm text-violet-200 bg-violet-600/20 hover:bg-violet-600/40 border-t border-gray-700">
                                    ＋ Khai báo thiết bị mới “<b className="font-mono">{l.code.trim()}</b>”
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 pt-3">
                          {d ? (
                            <>
                              <div className="text-sm">{deviceName(d)}</div>
                              <div className="text-xs text-gray-500">Seri: {d.serial_number || '—'} · Tồn: <b className="text-gray-300">{d.stock.left}</b> · Đang cấp: <b className="text-gray-300">{d.stock.held}</b></div>
                              {over && <div className="text-xs text-amber-400">⚠ Vượt số cho phép</div>}
                            </>
                          ) : l.isNew && type === 'NK'
                            ? <div className="text-sm"><span className="text-violet-300 font-semibold">Thiết bị mới</span> · {[l.nd.category ? settings.categories.find((c) => c.key === l.nd.category)?.label : '', l.nd.brand, l.nd.model].filter(Boolean).join(' · ') || 'chưa khai báo'}</div>
                            : <span className="text-xs text-gray-600">Chọn mã để hiện Loại · Hãng · Model · Seri</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input className={`${input} ${bd('qty' + i)}`} inputMode="numeric" value={l.qty}
                            onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^\d]/g, '') })} />
                        </td>
                        <td className="px-3 py-2">
                          <select className={`${input} ${bd('condition' + i)}`} value={l.condition} onChange={(e) => setLine(i, { condition: e.target.value })}>
                            <option value="">— chọn —</option>
                            {settings.conditions.map((t) => <option key={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input className={`${input} border-gray-700`} value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} /></td>
                        <td className="px-1 py-2 pt-3">
                          {lines.length > 1 && <button onClick={() => setLines(lines.filter((_, k) => k !== i))} title="Bỏ dòng" className="text-gray-500 hover:text-red-400"><Trash2 size={15} /></button>}
                        </td>
                      </tr>
                      {detail && <tr><td /><td colSpan={5} className="px-3 pb-3">{detail}</td><td /></tr>}
                    </tbody>
                  )
                })}
              </table>
            </div>
            <button onClick={() => setLines([...lines, newLine(type)])} className="mt-2 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm thiết bị</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="border border-gray-700 hover:border-gray-500 text-gray-300 px-4 py-2 rounded-lg text-sm">Huỷ</button>
          <span className="flex-1" />
          <button disabled={saving} onClick={() => { if (validate()) setPreview({ move: toPrintable(null), draft: true }) }}
            className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-500 text-gray-200 px-4 py-2 rounded-lg text-sm" title="In thử, chưa lưu">
            <Printer size={15} /> In
          </button>
          <button disabled={saving} onClick={() => save(false)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
            <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
          <button disabled={saving} onClick={() => save(true)} className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">
            <Printer size={15} /> Lưu và in
          </button>
        </div>
      </div>

      {alert && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6 text-center">
            <div className="text-4xl mb-2">{alert.icon}</div>
            <h3 className="font-semibold text-lg mb-2">{alert.title}</h3>
            <div className="text-sm text-gray-300 space-y-0.5">{alert.body}</div>
            <button onClick={() => setAlert(null)} className="mt-5 bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg text-sm font-medium">Đã hiểu, kiểm tra lại</button>
          </div>
        </div>
      )}
      {preview && <PrintPreview move={preview.move} draft={preview.draft} onClose={() => { const f = preview.afterClose; setPreview(null); f?.() }} />}
    </div>
  )
}
