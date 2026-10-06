'use client'
// "Sửa giao diện" Kho IT (Đợt 2, 01/10/2026) — CHỈ ADMIN. Sếp tự chỉnh mà không cần gọi làm demo:
//  1. Loại thiết bị & Thông số theo Loại   2. Trường Thông tin chung (đổi tên + thêm trường mới)
//  3. Cột ở danh sách Thiết bị              4. Danh sách Tình trạng
//  5. Ô Tổng quan                           6. Mẫu phiếu in (có xem trước)
// Sửa xong bấm LƯU mới áp dụng (giống trang chi tiết thiết bị). Phần tính tồn kho / phiếu giữ cố định.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Undo2, Upload } from 'lucide-react'
import { useRole } from '@/lib/hooks/useRole'
import { MOVE_DEFS, MOVE_ORDER, type MoveType } from '@/lib/kho/config'
import {
  BASE_FIELDS, BASE_FIELD_DEFAULT, LIST_COLS, LIST_COL_LABEL, TILE_KIND_LABEL, defaultSettings, newKey, normalizeSettings,
  type ExtraType, type KhoSettings, type TileKind,
} from '@/lib/kho/settings'
import { setKhoSettingsCache } from '@/lib/kho/useKhoSettings'
import { PhieuSheet, type PrintableMove } from '@/components/kho/PhieuPrint'

type Tab = 'cats' | 'fields' | 'cols' | 'conds' | 'tiles' | 'print' | 'people'
const TABS: [Tab, string][] = [
  ['cats', 'Loại & Thông số'], ['fields', 'Trường Thông tin chung'], ['cols', 'Cột danh sách'],
  ['conds', 'Tình trạng'], ['tiles', 'Ô Tổng quan'], ['print', 'Mẫu phiếu in'], ['people', 'Người Công việc'],
]
const EXTRA_TYPE_LABEL: Record<ExtraType, string> = { text: 'Chữ', number: 'Số', date: 'Ngày', select: 'Lựa chọn' }
const inputW = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500'
const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500'

// Đổi chỗ / xoá phần tử mảng (không sửa mảng gốc)
function move<T>(arr: T[], i: number, d: -1 | 1): T[] { const j = i + d; if (j < 0 || j >= arr.length) return arr; const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a }
function del<T>(arr: T[], i: number): T[] { return arr.filter((_, k) => k !== i) }
function upd<T>(arr: T[], i: number, patch: Partial<T>): T[] { return arr.map((x, k) => (k === i ? { ...x, ...patch } : x)) }

function RowBtns({ i, n, onMove, onDel, delTitle }: { i: number; n: number; onMove: (d: -1 | 1) => void; onDel: () => void; delTitle?: string }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button type="button" disabled={i === 0} onClick={() => onMove(-1)} title="Lên" className="p-1.5 text-gray-400 hover:text-white disabled:opacity-25"><ArrowUp size={14} /></button>
      <button type="button" disabled={i === n - 1} onClick={() => onMove(1)} title="Xuống" className="p-1.5 text-gray-400 hover:text-white disabled:opacity-25"><ArrowDown size={14} /></button>
      <button type="button" onClick={onDel} title={delTitle || 'Xoá'} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>
    </div>
  )
}

const SAMPLE: PrintableMove = {
  type: 'XK', so: 'XK260001', date: '2026-09-30', dnSo: '000000163', dnDate: '2026-09-26',
  info: { nguoi: 'Nguyễn Văn A', pb: 'Phòng Hành chính Nhân sự - IT', lydo: 'Cấp cho nhân viên mới', ncc: 'Nhà cung cấp mẫu', mst: '0312345678',nguoi2: 'Trần Thị B', pb2: 'Bộ phận Thi công', dien: 'Ghi chú mẫu' },
  lines: [
    { assetCode: 'LT-001', name: 'Laptop · HP · HP Zbook', serial: 'SN123', qty: 1, condition: 'Mới', note: null },
    { assetCode: 'MS-01', name: 'Phụ kiện · Logitech · M331', serial: null, qty: 2, condition: 'Mới', note: 'Kèm pin' },
  ],
}

// Thu nhỏ logo về tối đa 320px (PNG) để lưu gọn trong cấu hình
function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Không đọc được ảnh'))
    img.src = URL.createObjectURL(file)
  })
}

export default function GiaoDienPage() {
  const { isAdmin, role } = useRole()
  const [saved, setSaved] = useState<KhoSettings | null>(null)
  const [draft, setDraft] = useState<KhoSettings | null>(null)
  const [tab, setTab] = useState<Tab>('cats')
  const [catIdx, setCatIdx] = useState(0)
  const [printType, setPrintType] = useState<MoveType>('XK')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/kho-settings').then((r) => r.json()).then((j) => {
      if (!alive) return
      const s = j.data ? normalizeSettings(j.data) : defaultSettings()
      setSaved(s); setDraft(structuredClone(s))
      const t = new URLSearchParams(window.location.search).get('tab') as Tab | null
      if (t && TABS.some(([k]) => k === t)) setTab(t)
    })
    return () => { alive = false }
  }, [])

  const dirty = useMemo(() => !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    // Bấm link trong app (menu trái, "Xem Tổng quan"…) khi chưa lưu → hỏi lại
    const onClick = (e: MouseEvent) => {
      if (!dirty) return
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (a && !a.target && !confirm('Có thay đổi chưa lưu. Rời trang và bỏ các thay đổi?')) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('beforeunload', h)
    document.addEventListener('click', onClick, true)
    return () => { window.removeEventListener('beforeunload', h); document.removeEventListener('click', onClick, true) }
  }, [dirty])

  if (role && !isAdmin) return <div className="p-8 text-gray-400">Chỉ Admin mới vào được trang Sửa giao diện.</div>
  if (!draft || !saved) return <div className="p-8 text-gray-400">Đang tải...</div>

  const D = draft
  const set = (patch: Partial<KhoSettings>) => { setDraft({ ...D, ...patch }); setMsg(null) }

  async function save() {
    // Kiểm tra nhanh trước khi gửi (máy chủ kiểm tra lại)
    if (D.categories.some((c) => !c.label.trim())) { setMsg({ ok: false, text: 'Có Loại chưa đặt tên' }); return }
    if (D.extraFields.some((f) => !f.label.trim())) { setMsg({ ok: false, text: 'Có trường bổ sung chưa đặt tên' }); return }
    if (D.extraFields.some((f) => f.type === 'select' && !f.options.length)) { setMsg({ ok: false, text: 'Trường kiểu "Lựa chọn" phải có ít nhất 1 lựa chọn' }); return }
    if (D.tiles.some((t) => t.kind === 'category' && !t.arg)) { setMsg({ ok: false, text: 'Ô "Đếm theo 1 Loại" chưa chọn Loại' }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/kho-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(D) })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg({ ok: false, text: json.error || 'Chưa lưu được' }); return }
    const ns = normalizeSettings(json.data); setSaved(ns); setDraft(structuredClone(ns)); setKhoSettingsCache(ns)
    setMsg({ ok: true, text: 'Đã lưu — mọi trang dùng cấu hình mới' })
    setTimeout(() => setMsg(null), 3000)
  }

  const cat = D.categories[Math.min(catIdx, D.categories.length - 1)]
  const ci = D.categories.indexOf(cat)

  return (
    <div className="p-6 lg:p-8 max-w-6xl pb-28">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Sửa giao diện</h1>
        <p className="text-gray-400 text-sm mt-1">Kho IT · chỉ Admin · sửa xong bấm <b>Lưu</b> ở góc dưới mới áp dụng cho mọi người
          {saved.updatedAt && <> · lưu lần cuối {new Date(saved.updatedAt).toLocaleString('vi-VN')}{saved.updatedBy ? ` bởi ${saved.updatedBy}` : ''}</>}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm border ${tab === k ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>{label}</button>
        ))}
      </div>

      {/* ===== 1. Loại & Thông số ===== */}
      {tab === 'cats' && cat && (
        <div className="grid md:grid-cols-[300px_1fr] gap-5">
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-3">Loại thiết bị</h2>
            <div className="space-y-1.5">
              {D.categories.map((c, i) => (
                <div key={c.key} className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${i === ci ? 'border-blue-500 bg-blue-600/10' : 'border-gray-800'}`}>
                  <button type="button" onClick={() => setCatIdx(i)} className="flex-1 text-left text-sm py-1 truncate">{c.label || <i className="text-gray-500">(chưa đặt tên)</i>}<span className="text-xs text-gray-500"> · {c.specs.length} trường</span></button>
                  <RowBtns i={i} n={D.categories.length} onMove={(d) => { set({ categories: move(D.categories, i, d) }); setCatIdx(i + d) }}
                    onDel={() => { if (D.categories.length > 1 && confirm(`Xoá Loại "${c.label}"? (Không xoá được nếu đang có thiết bị dùng Loại này)`)) { set({ categories: del(D.categories, i) }); setCatIdx(0) } }} />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => { set({ categories: [...D.categories, { key: newKey('c_'), label: 'Loại mới', specs: [] }] }); setCatIdx(D.categories.length) }}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm Loại</button>
          </section>

          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <label className="block text-xs text-gray-400 mb-1">Tên Loại</label>
            <input className={input + ' mb-4 max-w-sm'} value={cat.label} onChange={(e) => set({ categories: upd(D.categories, ci, { label: e.target.value }) })} />
            <h2 className="font-semibold mb-1">Trường Thông số kĩ thuật của &quot;{cat.label}&quot;</h2>
            <p className="text-xs text-gray-500 mb-3">Đổi tên trường không mất dữ liệu đã nhập. Xoá trường thì giá trị cũ vẫn giữ trong thiết bị và hiện là &quot;trường cũ&quot;.</p>
            <div className="space-y-1.5">
              {cat.specs.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-6 text-right">{i + 1}</span>
                  <input className={input} value={s.label} onChange={(e) => set({ categories: upd(D.categories, ci, { specs: upd(cat.specs, i, { label: e.target.value }) }) })} />
                  <RowBtns i={i} n={cat.specs.length} onMove={(d) => set({ categories: upd(D.categories, ci, { specs: move(cat.specs, i, d) }) })}
                    onDel={() => set({ categories: upd(D.categories, ci, { specs: del(cat.specs, i) }) })} />
                </div>
              ))}
              {!cat.specs.length && <p className="text-sm text-gray-500">Chưa có trường nào.</p>}
            </div>
            <button type="button" onClick={() => set({ categories: upd(D.categories, ci, { specs: [...cat.specs, { key: newKey('s_'), label: 'Trường mới' }] }) })}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm trường thông số</button>
          </section>
        </div>
      )}

      {/* ===== 2. Trường Thông tin chung ===== */}
      {tab === 'fields' && (
        <div className="space-y-5">
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-1">Đổi tên trường có sẵn</h2>
            <p className="text-xs text-gray-500 mb-3">Chỉ đổi tên hiển thị (danh sách, chi tiết, Excel). Để trống = tên mặc định.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BASE_FIELDS.map((k) => (
                <div key={k}>
                  <label className="block text-xs text-gray-400 mb-1">Mặc định: {BASE_FIELD_DEFAULT[k]}</label>
                  <input className={input} value={D.fieldLabels[k]} placeholder={BASE_FIELD_DEFAULT[k]}
                    onChange={(e) => set({ fieldLabels: { ...D.fieldLabels, [k]: e.target.value } })} />
                </div>
              ))}
            </div>
          </section>
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-1">Trường bổ sung</h2>
            <p className="text-xs text-gray-500 mb-3">Hiện ở khối Thông tin chung của mọi thiết bị (VD: Ngày mua, Vị trí đặt, Nhà cung cấp). Tick &quot;Hiện ở danh sách&quot; để thêm thành 1 cột.</p>
            <div className="space-y-2">
              {D.extraFields.map((f, i) => (
                <div key={f.key} className="flex flex-wrap items-center gap-2 border border-gray-800 rounded-lg p-2">
                  <input className={inputW + ' flex-1 min-w-[160px]'} value={f.label} placeholder="Tên trường" onChange={(e) => set({ extraFields: upd(D.extraFields, i, { label: e.target.value }) })} />
                  <select className={inputW + ' w-32'} value={f.type} onChange={(e) => set({ extraFields: upd(D.extraFields, i, { type: e.target.value as ExtraType }) })}>
                    {(Object.keys(EXTRA_TYPE_LABEL) as ExtraType[]).map((t) => <option key={t} value={t}>{EXTRA_TYPE_LABEL[t]}</option>)}
                  </select>
                  {f.type === 'select' && (
                    <input key={f.key + '|' + f.options.join('|')} className={inputW + ' flex-1 min-w-[200px]'} placeholder="Các lựa chọn, cách nhau dấu phẩy" defaultValue={f.options.join(', ')}
                      onBlur={(e) => set({ extraFields: upd(D.extraFields, i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }) })} />
                  )}
                  <label className="flex items-center gap-1.5 text-sm text-gray-300 whitespace-nowrap">
                    <input type="checkbox" className="accent-blue-500" checked={f.inList} onChange={(e) => set({ extraFields: upd(D.extraFields, i, { inList: e.target.checked }) })} /> Hiện ở danh sách
                  </label>
                  <RowBtns i={i} n={D.extraFields.length} onMove={(d) => set({ extraFields: move(D.extraFields, i, d) })}
                    onDel={() => { if (confirm(`Bỏ trường "${f.label}"? Giá trị đã nhập vẫn giữ trong dữ liệu nhưng không hiện nữa.`)) set({ extraFields: del(D.extraFields, i) }) }} />
                </div>
              ))}
              {!D.extraFields.length && <p className="text-sm text-gray-500">Chưa có trường bổ sung.</p>}
            </div>
            <button type="button" onClick={() => set({ extraFields: [...D.extraFields, { key: newKey('x_'), label: 'Trường mới', type: 'text', options: [], inList: false }] })}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm trường</button>
          </section>
        </div>
      )}

      {/* ===== 3. Cột danh sách ===== */}
      {tab === 'cols' && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-w-xl">
          <h2 className="font-semibold mb-1">Cột ở danh sách Thiết bị</h2>
          <p className="text-xs text-gray-500 mb-3">{D.fieldLabels.asset_code} và {D.fieldLabels.category} luôn hiện. Trường bổ sung bật ở tab &quot;Trường Thông tin chung&quot;.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {LIST_COLS.map((k) => (
              <label key={k} className="flex items-center gap-2 border border-gray-800 rounded-lg px-3 py-2 text-sm cursor-pointer hover:border-gray-600">
                <input type="checkbox" className="accent-blue-500" checked={D.listColumns[k]} onChange={(e) => set({ listColumns: { ...D.listColumns, [k]: e.target.checked } })} />
                {['brand', 'model', 'serial_number', 'status'].includes(k) ? D.fieldLabels[k as 'brand'] : LIST_COL_LABEL[k]}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* ===== 4. Tình trạng ===== */}
      {tab === 'conds' && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-w-xl">
          <h2 className="font-semibold mb-1">Danh sách Tình trạng</h2>
          <p className="text-xs text-gray-500 mb-3">Dùng khi lập phiếu. Đổi tên / xoá chỉ áp dụng cho phiếu MỚI — phiếu đã lưu giữ nguyên chữ cũ.</p>
          <div className="space-y-1.5">
            {D.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={input} value={c} onChange={(e) => set({ conditions: D.conditions.map((x, k) => (k === i ? e.target.value : x)) })} />
                <RowBtns i={i} n={D.conditions.length} onMove={(d) => set({ conditions: move(D.conditions, i, d) })}
                  onDel={() => { if (D.conditions.length > 1) set({ conditions: del(D.conditions, i) }) }} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set({ conditions: [...D.conditions, 'Tình trạng mới'] })} className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm tình trạng</button>
        </section>
      )}

      {/* ===== 7. Người Công việc (Đợt 3) ===== */}
      {tab === 'people' && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-w-xl">
          <h2 className="font-semibold mb-1">Người dùng Công việc</h2>
          <p className="text-xs text-gray-500 mb-3">Danh sách riêng (khoảng 4–5 người) — ô <b>Phụ trách</b> chọn từ đây, ô <b>Người yêu cầu</b> gợi ý từ đây (vẫn gõ tay được). Không lấy từ HPcore.</p>
          <div className="space-y-1.5">
            {D.taskPeople.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={input} value={p} placeholder="Họ tên" onChange={(e) => set({ taskPeople: D.taskPeople.map((x, k) => (k === i ? e.target.value : x)) })} />
                <RowBtns i={i} n={D.taskPeople.length} onMove={(d) => set({ taskPeople: move(D.taskPeople, i, d) })} onDel={() => set({ taskPeople: del(D.taskPeople, i) })} />
              </div>
            ))}
            {!D.taskPeople.length && <p className="text-sm text-gray-500">Chưa có ai.</p>}
          </div>
          <button type="button" onClick={() => set({ taskPeople: [...D.taskPeople, ''] })} className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm người</button>
        </section>
      )}

      {/* ===== 5. Ô Tổng quan ===== */}
      {tab === 'tiles' && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-w-3xl">
          <h2 className="font-semibold mb-1">Ô số liệu ở Tổng quan Kho IT</h2>
          <p className="text-xs text-gray-500 mb-3">Số trong ô luôn TỰ ĐẾM từ dữ liệu. Ở đây chọn ô nào hiện, đặt tên, sắp thứ tự. Bấm vào ô sẽ mở đúng danh sách đã lọc.</p>
          <div className="space-y-2">
            {D.tiles.map((t, i) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 border border-gray-800 rounded-lg p-2">
                <select className={inputW + ' w-52'} value={t.kind} onChange={(e) => { const kind = e.target.value as TileKind; set({ tiles: upd(D.tiles, i, { kind, label: TILE_KIND_LABEL[kind], arg: kind === 'category' ? D.categories[0]?.key : undefined }) }) }}>
                  {(Object.keys(TILE_KIND_LABEL) as TileKind[]).map((k) => <option key={k} value={k}>{TILE_KIND_LABEL[k]}</option>)}
                </select>
                {t.kind === 'category' && (
                  <select className={inputW + ' w-44'} value={t.arg || ''} onChange={(e) => { const c = D.categories.find((x) => x.key === e.target.value); set({ tiles: upd(D.tiles, i, { arg: e.target.value, label: c ? c.label : t.label }) }) }}>
                    <option value="">— chọn Loại —</option>
                    {D.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                )}
                <input className={inputW + ' flex-1 min-w-[160px]'} value={t.label} placeholder="Tên hiện trên ô" onChange={(e) => set({ tiles: upd(D.tiles, i, { label: e.target.value }) })} />
                <RowBtns i={i} n={D.tiles.length} onMove={(d) => set({ tiles: move(D.tiles, i, d) })} onDel={() => set({ tiles: del(D.tiles, i) })} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set({ tiles: [...D.tiles, { id: newKey('t'), kind: 'total', label: TILE_KIND_LABEL.total }] })}
            className="mt-3 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm ô</button>
          <Link href="/dashboard/it" className="ml-4 text-sm text-gray-400 hover:text-white">Xem Tổng quan →</Link>
        </section>
      )}

      {/* ===== 6. Mẫu phiếu in ===== */}
      {tab === 'print' && (
        <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Chung cho cả 4 phiếu</h2>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Logo</label>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={D.print.logo || '/logo-company.png'} alt="logo" className="w-14 h-14 object-contain bg-white rounded p-1" />
                <label className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg text-sm cursor-pointer">
                  <Upload size={14} /> Chọn ảnh
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]; e.target.value = ''
                    if (!file) return
                    try { set({ print: { ...D.print, logo: await resizeLogo(file) } }) } catch { setMsg({ ok: false, text: 'Không đọc được ảnh logo' }) }
                  }} />
                </label>
                {D.print.logo && <button type="button" onClick={() => set({ print: { ...D.print, logo: null } })} className="text-xs text-gray-400 hover:text-white">Dùng logo mặc định</button>}
              </div>
            </div>
            {([['coName', 'Tên công ty'], ['coAddr', 'Địa chỉ'], ['coTax', 'Mã số thuế'], ['khoName', 'Tên kho in trên phiếu']] as const).map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input className={input} value={D.print[k]} onChange={(e) => set({ print: { ...D.print, [k]: e.target.value } })} />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" className="accent-blue-500" checked={D.print.showLetter} onChange={(e) => set({ print: { ...D.print, showLetter: e.target.checked } })} /> Hiện dòng ký hiệu cột (A, B, C…)</label>
            <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" className="accent-blue-500" checked={D.print.showDN} onChange={(e) => set({ print: { ...D.print, showDN: e.target.checked } })} /> Hiện ô &quot;Theo đề nghị số … ngày …&quot;</label>

            <h2 className="font-semibold pt-2">Riêng từng phiếu</h2>
            <div className="flex flex-wrap gap-1.5">
              {MOVE_ORDER.map((t) => (
                <button key={t} type="button" onClick={() => setPrintType(t)} className={`px-3 py-1.5 rounded-lg text-sm border ${printType === t ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'border-gray-700 text-gray-300'}`}>{MOVE_DEFS[t].label}</button>
              ))}
            </div>
            <PrintTypeEditor key={printType} cfg={D.print.types[printType]} onChange={(c) => set({ print: { ...D.print, types: { ...D.print.types, [printType]: c } } })}
              onReset={() => set({ print: { ...D.print, types: { ...D.print.types, [printType]: { title: MOVE_DEFS[printType].title, sign: [...MOVE_DEFS[printType].sign], foot: '' } } } })} />
          </section>
          <section className="bg-gray-800/50 border border-gray-800 rounded-xl p-3 overflow-auto max-h-[80vh]">
            <div className="text-xs text-gray-400 mb-2">Xem trước (dữ liệu mẫu) — phiếu {MOVE_DEFS[printType].label}</div>
            <div style={{ zoom: 0.62 }}><PhieuSheet move={{ ...SAMPLE, type: printType, so: `${printType}260001` }} cfg={D.print} /></div>
          </section>
        </div>
      )}

      {/* Thanh Lưu */}
      {(dirty || msg) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-800 border border-amber-500/60 rounded-xl px-4 py-2.5 shadow-2xl max-w-[calc(100vw-32px)] flex-wrap">
          {msg ? <span className={`text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</span> : <span className="text-sm text-amber-300">● Có thay đổi <b>chưa lưu</b></span>}
          {dirty && (
            <>
              <button onClick={() => { setDraft(structuredClone(saved)); setMsg(null) }} className="flex items-center gap-1.5 border border-gray-600 hover:border-gray-400 px-3 py-1.5 rounded-lg text-sm"><Undo2 size={14} /> Huỷ thay đổi</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-medium"><Save size={14} /> {saving ? 'Đang lưu…' : 'Lưu'}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PrintTypeEditor({ cfg, onChange, onReset }: { cfg: KhoSettings['print']['types'][MoveType]; onChange: (c: KhoSettings['print']['types'][MoveType]) => void; onReset: () => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Tiêu đề phiếu</label>
        <input className={input} value={cfg.title} onChange={(e) => onChange({ ...cfg, title: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Ô ký tên (từ trái qua phải)</label>
        <div className="space-y-1.5">
          {cfg.sign.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={input} value={s} onChange={(e) => onChange({ ...cfg, sign: cfg.sign.map((x, k) => (k === i ? e.target.value : x)) })} />
              <RowBtns i={i} n={cfg.sign.length} onMove={(d) => onChange({ ...cfg, sign: move(cfg.sign, i, d) })} onDel={() => { if (cfg.sign.length > 1) onChange({ ...cfg, sign: del(cfg.sign, i) }) }} />
            </div>
          ))}
        </div>
        {cfg.sign.length < 6 && <button type="button" onClick={() => onChange({ ...cfg, sign: [...cfg.sign, 'Người ký'] })} className="mt-2 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"><Plus size={14} /> Thêm ô ký</button>}
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Dòng ghi chú cuối phiếu (không bắt buộc)</label>
        <textarea className={input + ' min-h-[70px]'} value={cfg.foot} placeholder="VD: Người nhận có trách nhiệm bảo quản thiết bị…" onChange={(e) => onChange({ ...cfg, foot: e.target.value })} />
      </div>
      <button type="button" onClick={onReset} className="text-xs text-gray-400 hover:text-white">Khôi phục mặc định phiếu này</button>
    </div>
  )
}
