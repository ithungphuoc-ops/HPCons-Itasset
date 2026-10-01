'use client'
// Popup lập phiếu Nhập kho / Cấp phát / Thu hồi / Luân chuyển — đúng demo Sếp duyệt 30/09/2026:
//  • Ngày điền sẵn hôm nay, bấm chọn ngày khác được; tên người + phòng ban gõ tay
//  • Mã tài sản: gõ 2-3 ký tự → gợi ý từ Danh mục; mã ngoài danh mục → popup chặn, không cho lưu
//  • Số lượng chỉ nhận số nguyên ≥ 1; Tình trạng chọn từ danh sách; 1 phiếu nhiều thiết bị
//  • Cấp phát vượt tồn / thu hồi, luân chuyển vượt số đang cấp → chặn (server kiểm tra lại lần nữa)
//  • 3 nút: Lưu · In (in thử, chưa lưu) · Lưu và in
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Trash2, Printer, Save } from 'lucide-react'
import DatePicker from '@/components/DatePicker'
import { MOVE_DEFS, normalizeVi, todayIso, type MoveType } from '@/lib/kho/config'
import { deviceNameS } from '@/lib/kho/settings'
import { useKhoSettings } from '@/lib/kho/useKhoSettings'
import type { DeviceCategory } from '@/lib/types'
import { PrintPreview, type PrintableMove } from '@/components/kho/PhieuPrint'

export interface CatalogDevice {
  id: string; asset_code: string; category: DeviceCategory; brand: string; model: string
  serial_number?: string | null; stock: { left: number; held: number }
}

interface Line { code: string; deviceId: string; qty: string; condition: string; note: string }

const newLine = (type: MoveType, d?: CatalogDevice): Line => ({
  code: d?.asset_code || '', deviceId: d?.id || '', qty: '1', condition: type === 'NK' ? 'Mới' : '', note: '',
})

export default function PhieuModal({ type, presetDeviceId, onClose, onSaved }: {
  type: MoveType
  presetDeviceId?: string
  onClose: () => void
  onSaved: (move: { id: string; so: string | null }) => void
}) {
  const def = MOVE_DEFS[type]
  // Tình trạng, tên Loại, ô "Theo đề nghị" theo "Sửa giao diện"
  const { settings } = useKhoSettings()
  const deviceName = (d: CatalogDevice) => deviceNameS(settings, d)
  const [catalog, setCatalog] = useState<CatalogDevice[]>([])
  const [loadingCat, setLoadingCat] = useState(true)
  const [date, setDate] = useState(todayIso())
  const [info, setInfo] = useState<Record<string, string>>({})
  const [dnSo, setDnSo] = useState('')
  const [dnDate, setDnDate] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine(type)])
  const [errs, setErrs] = useState<Record<string, boolean>>({})
  const [alert, setAlert] = useState<{ icon: string; title: string; body: React.ReactNode } | null>(null)
  const [sugFor, setSugFor] = useState<number | null>(null)
  const [sugIdx, setSugIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ move: PrintableMove; draft: boolean; afterClose?: () => void } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

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
  function pick(i: number, d: CatalogDevice) { setLine(i, { code: d.asset_code, deviceId: d.id }); setSugFor(null) }

  // Kiểm tra tại chỗ (server kiểm tra lại trong transaction)
  function validate(): boolean {
    const e: Record<string, boolean> = {}
    const msgs: string[] = []
    if (!date) { e.date = true; msgs.push('Chưa chọn ngày') }
    def.fields.forEach((f) => { if (f.required && !String(info[f.key] || '').trim()) { e[f.key] = true; msgs.push('Chưa nhập ' + f.label.toLowerCase()) } })
    const bad: string[] = []
    const sum = new Map<string, number>()
    lines.forEach((l, i) => {
      const d = l.code.trim() ? findCode(l.code) : undefined
      if (!l.code.trim()) { e['code' + i] = true; msgs.push(`Dòng ${i + 1}: chưa nhập mã tài sản`) }
      else if (!d) { e['code' + i] = true; bad.push(l.code.trim()) }
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
      setAlert({ icon: '⛔', title: 'Mã thiết bị không có trong danh mục', body: <>Mã <b>{bad.join(', ')}</b> không có trong Danh mục thiết bị. Vui lòng kiểm tra lại — không thể {def.label.toLowerCase()} mã này.</> })
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
        const d = findCode(l.code)!
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
          lines: lines.map((l) => ({ deviceId: findCode(l.code)!.id, qty: Number(l.qty), condition: l.condition, note: l.note.trim() || null })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setAlert({ icon: '⚠', title: 'Chưa lưu được phiếu', body: json.error || 'Lỗi không xác định' }); return }
      if (thenPrint) setPreview({ move: toPrintable(json.data.so), draft: false, afterClose: () => onSaved(json.data) })
      else onSaved(json.data)
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500'
  const bd = (k: string) => (errs[k] ? 'border-red-500' : 'border-gray-700')

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8" onMouseDown={(e) => { if (sugFor !== null && boxRef.current && !(e.target as HTMLElement).closest('[data-ac]')) setSugFor(null) }}>
      <div ref={boxRef} className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl shadow-2xl">
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
            {def.fields.map((f) => (
              <div key={f.key} className={f.wide ? 'md:col-span-2' : ''}>
                <label className="block text-xs text-gray-400 mb-1">{f.label}{f.required && <b className="text-red-400"> *</b>}</label>
                <input className={`${input} ${bd(f.key)}`} value={info[f.key] || ''} placeholder="Gõ tay"
                  onChange={(e) => { setInfo({ ...info, [f.key]: e.target.value }); setErrs((x) => ({ ...x, [f.key]: false })) }} />
              </div>
            ))}
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

          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold text-sm">Thiết bị</h3>
              <span className="text-xs text-gray-500">{loadingCat ? 'Đang tải danh mục…' : `1 phiếu ghi được nhiều thiết bị · danh mục ${catalog.length} mã`}</span>
            </div>
            <div className="border border-gray-800 rounded-xl">
              <table className="w-full text-sm">
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
                <tbody>
                  {lines.map((l, i) => {
                    const d = l.code.trim() ? findCode(l.code) : undefined
                    const sug = sugFor === i ? suggestions(l.code) : []
                    const over = d && ((type === 'XK' && Number(l.qty) > d.stock.left) || ((type === 'TH' || type === 'LC') && Number(l.qty) > d.stock.held))
                    return (
                      <tr key={i} className="border-b border-gray-800/60 last:border-0 align-top">
                        <td className="px-3 py-2 text-gray-500 text-center pt-4">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="relative" data-ac>
                            <input className={`${input} ${bd('code' + i)}`} value={l.code} placeholder="Gõ 2-3 ký tự…" autoComplete="off"
                              onChange={(e) => { setLine(i, { code: e.target.value, deviceId: '' }); setSugFor(i); setSugIdx(0) }}
                              onFocus={() => { setSugFor(i); setSugIdx(0) }}
                              onKeyDown={(e) => {
                                if (!sug.length) return
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx((sugIdx + 1) % sug.length) }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setSugIdx((sugIdx - 1 + sug.length) % sug.length) }
                                if (e.key === 'Enter') { e.preventDefault(); pick(i, sug[sugIdx] || sug[0]) }
                                if (e.key === 'Escape') setSugFor(null)
                              }} />
                            {sugFor === i && normalizeVi(l.code).length >= 2 && (
                              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-auto">
                                {sug.length ? sug.map((s, k) => (
                                  <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(i, s) }}
                                    className={`w-full text-left px-3 py-2 text-sm ${k === sugIdx ? 'bg-blue-600/30' : 'hover:bg-gray-700'}`}>
                                    <b className="font-mono">{s.asset_code}</b> <span className="text-gray-400 text-xs">{deviceName(s)}</span>
                                  </button>
                                )) : <div className="px-3 py-2 text-sm text-gray-400">Không có mã nào khớp trong Danh mục</div>}
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
                          ) : <span className="text-xs text-gray-600">Chọn mã để hiện Loại · Hãng · Model · Seri</span>}
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
                    )
                  })}
                </tbody>
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
