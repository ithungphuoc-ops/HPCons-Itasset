'use client'
// Ảnh đính kèm phiếu (Sếp duyệt demo 22/10/2026):
//  • PhotoPicker — ảnh thiết bị lúc lập phiếu (Chụp ảnh / Chọn ảnh / kéo thả), thu nhỏ rồi tải lên R2 ngay
//  • SignNote — nhắc phiếu phải in ra ký (Cấp phát / Thu hồi / Luân chuyển, Admin chỉnh ở Sửa giao diện)
//  • SignStatus + SignUploadButton — "Chờ ký" → tải ảnh phiếu đã ký → "✓ Đã ký"
//  • PendingSignModal — danh sách "Phiếu chờ ký"
//  • PhotoLightbox / PhotoCell — bấm ảnh xem to, ‹ › chuyển ảnh, Esc đóng
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, Loader2, PenLine, Upload, X } from 'lucide-react'
import { MOVE_DEFS, fmtDate } from '@/lib/kho/config'
import { photoUrl, uploadPhoto, type MovePhoto } from '@/lib/kho/photos'
import type { FirestoreMove } from '@/lib/firestore/types'

export type Lightbox = { photos: MovePhoto[]; index: number; caption: string } | null

export function PhotoLightbox({ lb, onClose }: { lb: NonNullable<Lightbox>; onClose: () => void }) {
  const [i, setI] = useState(lb.index)
  const n = lb.photos.length
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % n)
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + n) % n)
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [n, onClose])
  const p = lb.photos[i]
  if (typeof document === 'undefined' || !p) return null
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/90 flex flex-col items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(p.key)} alt={p.name} className="max-h-[80vh] max-w-full rounded-lg shadow-2xl" />
      <div className="mt-3 text-sm text-gray-300 text-center">Ảnh {i + 1}/{n} · {lb.caption} · {p.name}</div>
      <a href={photoUrl(p.key)} download={p.name} className="mt-2 text-xs text-blue-400 hover:underline">Tải về máy</a>
      {n > 1 && <>
        <button type="button" onClick={() => setI((i - 1 + n) % n)} className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-2xl">‹</button>
        <button type="button" onClick={() => setI((i + 1) % n)} className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-2xl">›</button>
      </>}
      <button type="button" onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center"><X size={20} /></button>
    </div>,
    document.body,
  )
}

/** Ô ảnh nhỏ trong bảng lịch sử phiếu (ảnh đầu + "+n") */
export function PhotoCell({ photos, caption, onView, border = 'border-gray-700' }: { photos?: MovePhoto[] | null; caption: string; onView: (lb: NonNullable<Lightbox>) => void; border?: string }) {
  if (!photos?.length) return <span className="text-gray-600">—</span>
  return (
    <button type="button" onClick={() => onView({ photos, index: 0, caption })} title={`Xem ${photos.length} ảnh`} className="flex items-center gap-1.5 group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(photos[0].key)} alt="" className={`w-9 h-9 rounded object-cover border ${border} group-hover:border-blue-400`} />
      {photos.length > 1 && <span className="text-xs text-gray-400">+{photos.length - 1}</span>}
    </button>
  )
}

async function uploadAll(files: File[], onEach: (p: MovePhoto) => void): Promise<string[]> {
  const errs: string[] = []
  for (const f of files) {
    try { onEach(await uploadPhoto(f)) } catch (e) { errs.push((e as Error).message) }
  }
  return errs
}

/** Ảnh thiết bị trong popup phiếu */
export function PhotoPicker({ value, onChange, max, required, hint, onBusy }: {
  value: MovePhoto[]; onChange: (v: MovePhoto[]) => void; max: number; required: boolean; hint: string; onBusy?: (b: boolean) => void
}) {
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [lb, setLb] = useState<Lightbox>(null)
  const cur = useRef(value)
  useEffect(() => { cur.current = value }, [value])
  // Đếm ảnh đang tải chung cho mọi lần chọn — chọn 2 lần liên tiếp vẫn chặn Lưu tới khi tải xong hết
  const inflight = useRef(0)
  const bump = (d: number) => { inflight.current = Math.max(0, inflight.current + d); setBusy(inflight.current); onBusy?.(inflight.current > 0) }
  async function add(list: FileList | File[] | null) {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const room = max - cur.current.length - inflight.current
    const take = files.slice(0, Math.max(0, room))
    setErr(files.length > take.length ? `Tối đa ${max} ảnh / phiếu` : '')
    if (!take.length) return
    bump(take.length)
    const errs = await uploadAll(take, (p) => { cur.current = [...cur.current, p]; onChange(cur.current); bump(-1) })
    if (errs.length) { bump(-errs.length); setErr(errs.join(' · ')) }
  }
  const n = value.length
  const tile = 'w-24 h-24 rounded-lg border border-dashed border-gray-600 hover:border-blue-500 flex flex-col items-center justify-center gap-1 text-xs text-gray-300 cursor-pointer'
  return (
    <div className={`rounded-xl border p-4 ${drag ? 'border-blue-500 bg-blue-500/5' : 'border-gray-800'}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="font-semibold text-sm">Ảnh thiết bị</h3>
        <span className={`text-xs ${required && !n ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>{n}/{max} ảnh · {required ? 'bắt buộc ít nhất 1 ảnh' : 'không bắt buộc'}</span>
        <span className="text-xs text-gray-500">· VD: {hint}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((p, i) => (
          <div key={p.key} className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-700 bg-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.key)} alt="" onClick={() => setLb({ photos: value, index: i, caption: 'phiếu đang lập' })} className="w-full h-full object-cover cursor-zoom-in" />
            <button type="button" title="Bỏ ảnh" onClick={() => onChange(value.filter((x) => x.key !== p.key))}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center"><X size={13} /></button>
            <span className="absolute bottom-0 inset-x-0 text-[10px] text-center bg-black/60 text-gray-200">{Math.max(1, Math.round(p.size / 1024))} KB</span>
          </div>
        ))}
        {Array.from({ length: busy }).map((_, i) => (
          <div key={'b' + i} className="w-24 h-24 rounded-lg border border-gray-700 bg-gray-800 flex flex-col items-center justify-center gap-1 text-[11px] text-gray-400"><Loader2 size={18} className="animate-spin" /> Đang tải…</div>
        ))}
        {n + busy < max && <>
          <label className={tile}><Camera size={20} className="text-blue-400" />Chụp ảnh
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
          </label>
          <label className={tile}><ImagePlus size={20} className="text-blue-400" />Chọn ảnh
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
          </label>
        </>}
      </div>
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
      <p className="text-[11px] text-gray-500 mt-2">Kéo thả ảnh vào khung này cũng được · ảnh tự thu nhỏ trước khi tải lên (cạnh dài 1600px) cho nhẹ · phiếu in giữ nguyên 1 trang, ảnh xem lại ở lịch sử phiếu.</p>
      {lb && <PhotoLightbox lb={lb} onClose={() => setLb(null)} />}
    </div>
  )
}

export function SignNote() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
      <PenLine size={16} className="mt-0.5 text-amber-300 shrink-0" />
      <div><b>Phiếu này phải in ra ký xác nhận.</b> Bấm <b>Lưu và in</b> → ký đủ các ô → chụp phiếu đã ký tải lên (ở Lịch sử phiếu của thiết bị hoặc nút <b>Phiếu chờ ký</b> ở trang Thiết bị). Chưa tải thì phiếu hiện <span className="font-semibold text-amber-300">Chờ ký</span>.</div>
    </div>
  )
}

/** Nút tải ảnh phiếu đã ký (chọn nhiều ảnh nếu phiếu nhiều trang) */
export function SignUploadButton({ moveId, onDone }: { moveId: string; onDone: (m: FirestoreMove) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function go(list: FileList | null) {
    const files = [...(list || [])].filter((f) => f.type.startsWith('image/')).slice(0, 10)
    if (!files.length) return
    setBusy(true); setErr('')
    const got: MovePhoto[] = []
    const errs = await uploadAll(files, (p) => got.push(p))
    if (got.length) {
      const res = await fetch(`/api/moves/${moveId}/signed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photos: got }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) errs.push(json.error || 'Chưa lưu được ảnh phiếu đã ký')
      else onDone(json.data)
    }
    setBusy(false)
    if (errs.length) setErr(errs.join(' · '))
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <label className={`inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20 rounded-md px-2 py-1 whitespace-nowrap ${busy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {busy ? 'Đang tải…' : 'Chờ ký · tải phiếu đã ký'}
        <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => { go(e.target.files); e.target.value = '' }} />
      </label>
      {err && <span className="text-[11px] text-red-400 max-w-[220px]">{err}</span>}
    </span>
  )
}

/** Cột "Phiếu ký": ✓ Đã ký (bấm xem) · Chờ ký (nút tải) · — (phiếu không cần ký) */
export function SignStatus({ move, canWrite, onSigned, onView }: { move: FirestoreMove; canWrite: boolean; onSigned: (m: FirestoreMove) => void; onView: (lb: NonNullable<Lightbox>) => void }) {
  if (move.signed?.length) {
    return (
      <button type="button" onClick={() => onView({ photos: move.signed!, index: 0, caption: `phiếu ${move.so} đã ký` })} title="Xem phiếu đã ký" className="flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(move.signed[0].key)} alt="" className="w-9 h-9 rounded object-cover border border-green-600/60" />
        <span className="text-xs text-green-400 whitespace-nowrap">✓ Đã ký</span>
      </button>
    )
  }
  if (!move.signPending) return <span className="text-gray-600">—</span>
  return canWrite ? <SignUploadButton moveId={move.id} onDone={onSigned} /> : <span className="text-xs font-semibold text-amber-300">Chờ ký</span>
}

/** Danh sách "Phiếu chờ ký" (nút ở trang Thiết bị / ô Tổng quan) */
export function PendingSignModal({ canWrite, onClose, onChanged }: { canWrite: boolean; onClose: () => void; onChanged?: (n: number) => void }) {
  const [list, setList] = useState<FirestoreMove[] | null>(null)
  const [lb, setLb] = useState<Lightbox>(null)
  useEffect(() => {
    fetch('/api/moves?pending=1').then((r) => r.json()).then((j) => setList(j.data || [])).catch(() => setList([]))
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lb) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [lb, onClose])
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-lg">Phiếu chờ ký</h2>
          <span className="text-xs text-gray-500">đã lưu + in, chưa tải ảnh phiếu có chữ ký</span>
          <span className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5">
          {list === null ? <p className="text-sm text-gray-400">Đang tải…</p> : list.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-800"><th className="py-2">Số phiếu</th><th className="py-2">Loại</th><th className="py-2">Ngày</th><th className="py-2">Người</th><th className="py-2">Thiết bị</th><th className="py-2" /></tr></thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.id} className="border-b border-gray-800/60">
                      <td className="py-2 font-mono text-xs text-blue-300">{m.so}</td>
                      <td className="py-2">{MOVE_DEFS[m.type].label}</td>
                      <td className="py-2 text-gray-400">{fmtDate(m.date)}</td>
                      <td className="py-2">{m.info.nguoi}{m.type === 'LC' && m.info.nguoi2 ? ` → ${m.info.nguoi2}` : ''}</td>
                      <td className="py-2 font-mono text-xs">{m.lines.map((l) => l.assetCode).join(', ')}</td>
                      <td className="py-2 text-right">
                        <SignStatus move={m} canWrite={canWrite} onView={setLb}
                          onSigned={(nm) => { const next = list.map((x) => (x.id === nm.id ? nm : x)); setList(next); onChanged?.(next.filter((x) => !x.signed?.length).length) }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-gray-400">Không còn phiếu nào chờ ký. 👍</p>}
          <p className="text-xs text-gray-500 mt-3">Số liệu tồn kho / người đang giữ đã cập nhật ngay khi lưu phiếu (cần số phiếu để in); &quot;Chờ ký&quot; là nhắc còn thiếu chứng từ có chữ ký.</p>
        </div>
      </div>
      {lb && <PhotoLightbox lb={lb} onClose={() => setLb(null)} />}
    </div>
  )
}
