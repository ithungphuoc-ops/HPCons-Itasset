'use client'
// Popup "Nhập Excel" — nhập thiết bị cũ từ file Excel (Admin + IT Staff, Sếp duyệt demo 23/10/2026).
// Trình duyệt đọc file + xem trước (lib/kho/importExcel.ts); bấm Nhập mới gửi các dòng hợp lệ lên máy chủ.
import { useEffect, useMemo, useState } from 'react'
import { X, FileSpreadsheet, Download, Check, Loader2 } from 'lucide-react'
import { fmtDate, normalizeVi, todayIso } from '@/lib/kho/config'
import type { KhoSettings } from '@/lib/kho/settings'
import { setKhoSettingsCache } from '@/lib/kho/useKhoSettings'
import { IMPORT_MAX_ROWS, SHARED_HOLDER, parseWorkbook, seriKey, toPayload, willImport, type ImportRow, type SheetIn } from '@/lib/kho/importExcel'

interface Result { created: number; held: number; newCategories: string[]; skipped: { sheet: string; line: number; code: string; reason: string }[] }

export default function ImportExcelModal({ S, devices, onClose, onDone }: {
  S: KhoSettings; devices: { asset_code: string; model: string; serial_number?: string | null }[]; onClose: () => void; onDone: () => void
}) {
  const [people, setPeople] = useState<string[]>([])
  const [file, setFile] = useState<{ name: string; sheets: SheetIn[] } | null>(null)
  const [tab, setTab] = useState(0)
  const [onlyIssue, setOnlyIssue] = useState(false)
  const [incl, setIncl] = useState<Set<number>>(new Set()) // dòng "có thể trùng" Admin tick vẫn nhập
  const [drag, setDrag] = useState(false)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  // Tên Nhân viên (HPcore, API có cache) — để sửa hoa / thường tên người sở hữu cho khớp danh sách
  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((j) => setPeople(((j.data || []) as { full_name: string }[]).map((e) => e.full_name))).catch(() => {})
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [busy, onClose])

  const existing = useMemo(() => new Set(devices.map((d) => normalizeVi(d.asset_code))), [devices])
  const existingSeri = useMemo(() => new Map(devices.filter((d) => d.serial_number).map((d) => [seriKey(d.serial_number!, d.model || ''), d.asset_code])), [devices])
  const P = useMemo(() => (file ? parseWorkbook(file.sheets, S, existing, people, existingSeri) : null), [file, S, existing, people, existingSeri])
  const will = (r: ImportRow, i: number) => willImport(r) || (r.status === 'dup' && incl.has(i))

  async function pick(f?: File | null) {
    if (!f) return
    setErr('')
    if (!/\.xlsx?$/i.test(f.name)) { setErr('Chỉ nhận file Excel .xlsx / .xls'); return }
    if (f.size > 10 * 1024 * 1024) { setErr('File quá lớn (tối đa 10 MB)'); return }
    setReading(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      const sheets = wb.SheetNames.map((n) => ({ name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false }) as unknown[][] }))
      setFile({ name: f.name, sheets }); setTab(0); setIncl(new Set()); setOnlyIssue(false)
    } catch (e) {
      setErr('Không đọc được file: ' + (e as Error).message)
    }
    setReading(false)
  }

  async function doImport() {
    if (!P || !file) return
    const rows = P.rows.filter(will)
    if (rows.length > IMPORT_MAX_ROWS) { setErr(`Mỗi lần nhập tối đa ${IMPORT_MAX_ROWS} thiết bị — chia file làm nhiều lần`); return }
    setBusy(true); setErr('')
    const res = await fetch('/api/devices/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: file.name, date: P.date || todayIso(), rows: rows.map(toPayload) }),
    }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res || !res.ok) { setErr(j.error || 'Nhập thất bại — kiểm tra mạng rồi thử lại'); if (res) onDone(); return }
    const before = P.rows.filter((r, i) => !will(r, i)).map((r) => ({ sheet: r.sheet, line: r.line, code: r.code, reason: r.msg }))
    const data = j.data as Result
    setResult({ ...data, skipped: [...before, ...data.skipped] })
    // Có Loại mới → nạp lại cấu hình để ô lọc Loại / Sửa giao diện thấy ngay, không cần tải lại trang
    if (data.newCategories.length) fetch('/api/kho-settings').then((r) => r.json()).then((s) => { if (s.data) setKhoSettingsCache(s.data) }).catch(() => {})
    onDone()
  }

  function downloadSkipped() {
    if (!result) return
    const lines = [['Sheet', 'Dòng Excel', 'Mã tài sản', 'Lý do không nhập'], ...result.skipped.map((s) => [s.sheet, s.line, s.code, s.reason])]
    // Ô bắt đầu bằng = + - @ → thêm dấu ' để Excel không hiểu thành công thức
    const cell = (x: unknown) => { const s = String(x ?? ''); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` }
    const csv = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'Dong-khong-nhap.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  const btn = 'px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 text-sm'
  let body: React.ReactNode, foot: React.ReactNode

  if (result) {
    body = (
      <div className="text-center py-6">
        <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3"><Check className="text-green-400" size={32} /></div>
        <div className="text-xl font-bold mb-1">Đã nhập {result.created} thiết bị</div>
        <div className="text-sm text-gray-400">
          {result.held} thiết bị ghi người đang giữ · {result.created - result.held} để trong kho
          {result.newCategories.length > 0 && <> · tạo Loại mới: {result.newCategories.join(', ')}</>}
        </div>
        <div className="text-sm text-gray-400 mt-1">Phiếu ghi dạng &quot;dữ liệu cũ&quot; ngày {fmtDate(P?.date || todayIso())} · không cấp số phiếu, không vào Phiếu chờ ký</div>
        {result.skipped.length > 0 && (
          <div className="mt-4 text-sm text-amber-300">
            {result.skipped.length} dòng không nhập — <button type="button" onClick={downloadSkipped} className="underline">tải danh sách (.csv)</button> để sửa file rồi nhập lại (dòng đã nhập sẽ tự bỏ qua)
          </div>
        )}
      </div>
    )
    foot = <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm">Xong</button>
  } else if (!P || !file) {
    body = (
      <>
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
          className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${drag ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-blue-500'}`}>
          {reading ? <Loader2 className="mx-auto text-blue-400 mb-2 animate-spin" size={40} /> : <FileSpreadsheet className="mx-auto text-blue-400 mb-2" size={40} />}
          <div className="font-medium">{reading ? 'Đang đọc file…' : <>Kéo thả file Excel vào đây hoặc <span className="text-blue-400 underline">chọn file .xlsx</span></>}</div>
          <div className="text-xs text-gray-500 mt-1">Dùng file mẫu bên dưới, hoặc file ThongSo của máy quét đã thêm cột <b className="text-gray-300">Mã tài sản</b></div>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <a href="/api/devices/import-template" download className="flex items-center gap-1.5 border border-green-600/60 hover:border-green-500 text-green-300 px-3 py-2 rounded-lg text-sm">
            <Download size={15} /> Tải file mẫu
          </a>
          <span className="text-xs text-gray-500">mỗi Loại 1 sheet, cột theo Sửa giao diện hiện tại · điền xong chọn file ở trên để nhập</span>
        </div>
        <div className="mt-5 bg-gray-800/40 border border-gray-800 rounded-xl p-4 text-sm text-gray-300">
          <div className="font-semibold text-white mb-2">App đọc file thế nào</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Mỗi sheet = 1 nhóm thiết bị. Dòng tiêu đề là dòng có cột <b>Hãng / Model / Mã tài sản</b> (tiêu đề lớn phía trên bỏ qua). Sheet không có thiết bị (Hướng dẫn, Tổng hợp) → bỏ qua.</li>
            <li><b>Mã tài sản</b>: bắt buộc, không trùng — dòng trống mã / trùng mã / mã đã có trong app thì <b>không nhập</b> (app liệt kê để sửa file).</li>
            <li><b>Loại</b>: theo cột Loại / Loại thiết bị (PC, Laptop, Máy in laser → Máy in…); không có cột thì theo tên sheet. Tên chưa có Loại nào → <b>tạo Loại mới</b>.</li>
            <li><b>Người sở hữu + Phòng ban</b> → ghi luôn <b>Người đang giữ</b>. Thiết bị dùng chung → người giữ &quot;{SHARED_HOLDER}&quot; + phòng / tầng. Tên trùng danh sách Nhân viên thì lấy đúng cách viết trong danh sách.</li>
            <li>Cột trùng tên trường thông số của Loại đó → vào Thông số. Cột app chưa có trường → <b>để trống</b> (muốn giữ thì thêm trường cùng tên ở Sửa giao diện rồi nhập).</li>
            <li>Giá trị &quot;rác&quot; do máy quét ghi (System manufacturer, Default string, To Be Filled By O.E.M., seri 0 / 16843009…) → để trống. Thiếu thông số bắt buộc vẫn nhập, thiết bị gắn nhãn ⚠ Thiếu thông số.</li>
          </ul>
        </div>
      </>
    )
    foot = <button type="button" onClick={onClose} className={btn}>Huỷ</button>
  } else {
    const all = P.rows
    const idx = new Map(all.map((r, i) => [r, i]))
    const imp = all.filter(will), skip = all.filter((r, i) => !will(r, i)), warn = imp.filter((r) => r.status === 'warn')
    const holders = new Set(imp.filter((r) => r.holder).map((r) => normalizeVi(r.holder === SHARED_HOLDER ? 'dc:' + r.pb : r.holder)))
    const sh = P.sheets[Math.min(tab, P.sheets.length - 1)]
    const rows = sh ? all.filter((r) => r.sheet === sh.name && (!onlyIssue || r.status !== 'ok')) : []
    const ign = Object.entries(P.ignored)
    const labelOf = (r: ImportRow, k: string) => S.categories.find((c) => c.key === r.catKey)?.specs.find((f) => f.key === k)?.label || k
    const card = (n: number, l: string, cls: string) => (
      <div className="bg-gray-800/40 border border-gray-800 rounded-xl px-4 py-3"><div className={`text-2xl font-bold ${cls}`}>{n}</div><div className="text-xs text-gray-400">{l}</div></div>
    )
    const note = 'rounded-lg bg-gray-800/50 border border-gray-700 px-3 py-2 text-gray-300'
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
          <FileSpreadsheet size={16} className="text-green-400" /><b>{file.name}</b>
          <span className="text-gray-500">· ngày ghi phiếu: {fmtDate(P.date || todayIso())}{P.date ? ' (lấy trong file)' : ' (hôm nay — file không ghi ngày)'}</span>
          <button type="button" onClick={() => { setFile(null); setErr('') }} className="ml-auto text-blue-400 hover:text-blue-300">Chọn file khác</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {card(imp.length, 'thiết bị sẽ nhập', 'text-green-400')}
          {card(holders.size, 'người / phòng đang giữ (ghi luôn)', 'text-blue-300')}
          {card(skip.length, 'dòng không nhập — xem lý do', skip.length ? 'text-red-400' : 'text-gray-400')}
          {card(warn.length, 'thiếu thông số bắt buộc (vẫn nhập)', warn.length ? 'text-amber-300' : 'text-gray-400')}
        </div>
        <div className="space-y-1.5 mb-3 text-[13px]">
          {P.newCats.length > 0 && <div className="rounded-lg bg-violet-500/10 border border-violet-500/30 px-3 py-2">➕ Sẽ tạo <b>Loại mới</b>: <b>{P.newCats.join(', ')}</b> <span className="text-gray-400">(chưa có trường thông số — thêm ở Sửa giao diện nếu cần)</span></div>}
          {ign.length > 0 && (
            <div className={note}>Cột app chưa có trường → <b>để trống</b>:{' '}
              {ign.map(([c, cols], i) => <span key={c}>{i > 0 && ' · '}<b>{c}</b>: {Object.entries(cols).map(([h, n]) => `${h} (${n})`).join(', ')}</span>)}
            </div>
          )}
          {P.junk.length > 0 && <div className={note}>Giá trị rác của máy quét → để trống: <span className="text-gray-400 font-mono text-xs">{P.junk.slice(0, 8).join(', ')}{P.junk.length > 8 ? '…' : ''}</span></div>}
          {P.pbFix.length > 0 && <div className={note}>Phòng ban viết khác nhau → gộp: {P.pbFix.map(([a, b]) => `"${a}" → "${b}"`).join(', ')}</div>}
          {P.nameFix.length > 0 && <div className={note}>Tên người theo danh sách Nhân viên: {P.nameFix.slice(0, 6).map(([a, b]) => `"${a}" → "${b}"`).join(', ')}{P.nameFix.length > 6 ? ` … (${P.nameFix.length} tên)` : ''}</div>}
          {P.noHeader.length > 0 && <div className="text-gray-500">Sheet không có thiết bị (bỏ qua): {P.noHeader.join(', ')}</div>}
        </div>
        {P.sheets.length === 0 ? <p className="text-sm text-red-400 py-4">Không tìm thấy dòng thiết bị nào — kiểm tra file có dòng tiêu đề (Mã tài sản / Hãng / Model) chưa.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {P.sheets.map((s, i) => (
                <button key={s.name} type="button" onClick={() => setTab(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${i === tab ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                  {s.name} <span className="text-gray-500">{s.count}</span>{all.some((r, j) => r.sheet === s.name && !will(r, j)) && <span className="text-red-400"> ●</span>}
                </button>
              ))}
              <label className="ml-auto text-sm text-gray-300 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="accent-blue-500" checked={onlyIssue} onChange={(e) => setOnlyIssue(e.target.checked)} /> Chỉ hiện dòng cần xem</label>
            </div>
            <div className="border border-gray-800 rounded-lg overflow-auto max-h-[42vh]">
              <table className="w-full text-[13px] min-w-[1100px]">
                <thead className="sticky top-0 bg-gray-900"><tr className="text-left text-xs text-gray-400 border-b border-gray-800">
                  {['Dòng', 'Mã tài sản', 'Loại', 'Hãng', 'Model', 'Số Seri', 'Người đang giữ', 'Phòng ban', 'Thông số', 'Kết quả'].map((h) => <th key={h} className="px-2 py-2 whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.length ? rows.map((r) => {
                    const i = idx.get(r)!, ok = will(r, i), dash = <span className="text-gray-600">–</span>
                    return (
                      <tr key={i} className={`border-b border-gray-800/60 align-top ${ok ? '' : 'bg-red-500/5'}`}>
                        <td className="px-2 py-1.5 text-gray-500">{r.line}</td>
                        <td className={`px-2 py-1.5 font-mono ${r.code ? 'text-blue-300' : 'text-red-400'}`}>{r.code || '(trống)'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.catLabel}{!r.catKey && <span className="ml-1 text-[10px] font-bold bg-violet-600 text-white rounded px-1 py-0.5">LOẠI MỚI</span>}</td>
                        <td className="px-2 py-1.5">{r.brand || dash}</td>
                        <td className="px-2 py-1.5 text-gray-300">{r.model || dash}</td>
                        <td className="px-2 py-1.5 text-gray-400">{r.serial || '–'}</td>
                        <td className="px-2 py-1.5">{r.holder || <span className="text-gray-500">(để trong kho)</span>}</td>
                        <td className="px-2 py-1.5 text-gray-300">{r.pb}</td>
                        <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap" title={Object.entries(r.specs).map(([k, v]) => `${labelOf(r, k)}: ${v}`).join('\n')}>{r.specTotal ? `${Object.keys(r.specs).length}/${r.specTotal} ô` : '—'}</td>
                        <td className="px-2 py-1.5">
                          {r.status === 'ok' ? <span className="text-xs text-green-400">✓ Nhập</span>
                            : r.status === 'warn' ? <span className="text-xs text-amber-300">⚠ Nhập · {r.msg}</span>
                            : r.status === 'dup' ? <>
                                <span className="text-xs text-amber-300">{ok ? '⚠ Vẫn nhập' : 'Bỏ qua'} · {r.msg}</span>{' '}
                                <label className="text-xs text-gray-300 whitespace-nowrap cursor-pointer"><input type="checkbox" className="accent-blue-500" checked={ok}
                                  onChange={(e) => setIncl((s) => { const n = new Set(s); if (e.target.checked) n.add(i); else n.delete(i); return n })} /> vẫn nhập</label>
                              </>
                            : <span className="text-xs text-red-400">✕ Bỏ qua · {r.msg}</span>}
                        </td>
                      </tr>
                    )
                  }) : <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">Không có dòng nào cần xem</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">Rê chuột lên ô &quot;Thông số&quot; để xem giá trị. Mỗi thiết bị ghi 1 phiếu Nhập kho + 1 phiếu Cấp phát dạng <b className="text-gray-300">&quot;dữ liệu cũ&quot;</b>: không cấp số phiếu, không vào Phiếu chờ ký, tồn kho / người đang giữ đúng ngay.</p>
          </>
        )}
      </>
    )
    foot = (
      <>
        <button type="button" onClick={onClose} disabled={busy} className={btn}>Huỷ</button>
        <button type="button" onClick={doImport} disabled={busy || !imp.length} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-40 flex items-center gap-2">
          {busy && <Loader2 size={15} className="animate-spin" />}{busy ? 'Đang nhập…' : `Nhập ${imp.length} thiết bị`}
        </button>
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-lg">Nhập thiết bị cũ từ Excel</h2>
          <span className="text-xs text-gray-500 ml-1 hidden sm:inline">chuyển danh sách thiết bị đang có vào app</span>
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5">{body}</div>
        {err && <div className="mx-5 mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-800">{foot}</div>
      </div>
    </div>
  )
}
