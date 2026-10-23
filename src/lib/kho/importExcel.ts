// Nhập thiết bị cũ từ Excel (Sếp duyệt demo 23/10/2026) — dùng chung trình duyệt (đọc file + xem trước)
// và máy chủ (dựng file mẫu, kiểm lại trước khi ghi). Nhận 2 kiểu file:
//  • File mẫu của app: mỗi Loại 1 sheet (tên sheet = tên Loại), dòng 2 "Ngày ghi phiếu", dòng 3 tiêu đề.
//  • File ThongSo của máy quét: sheet Máy tính (cột Loại = PC / Laptop), Màn hình, Chuột, Bàn phím,
//    Dùng chung (cột "Sở hữu" = phòng / tầng) — cùng quy tắc đọc.
// Quy tắc Sếp chốt: Mã tài sản Sếp tự điền (trống → không nhập); ghi luôn người đang giữ; Loại chưa có
// → tạo Loại mới; cột app chưa có trường → để trống (khớp cột theo TÊN trường thông số).
import { assetCodeError, normalizeVi } from '@/lib/kho/config'
import type { KhoSettings } from '@/lib/kho/settings'

export type Aoa = unknown[][]
export interface SheetIn { name: string; aoa: Aoa }

export const IMPORT_MAX_ROWS = 2000
export const SHARED_HOLDER = 'Dùng chung'
export const IMPORT_NCC = 'Số dư đầu kỳ (nhập từ Excel)'
export const IMPORT_LYDO = 'Đang giữ (nhập từ Excel)'
export const TEMPLATE_BASE = ['STT', 'Mã tài sản', 'Người sở hữu', 'Phòng ban', 'Hãng', 'Model', 'Số Seri'] as const

// Tên cột → vai trò (so khớp bỏ dấu, không phân biệt hoa thường, bỏ dấu *)
type Role = 'stt' | 'code' | 'holder' | 'owner' | 'pb' | 'cat' | 'brand' | 'model' | 'serial'
const ROLE: Record<string, Role> = {
  'stt': 'stt', 'ma tai san': 'code', 'ma ts': 'code',
  'nguoi so huu': 'holder', 'nguoi dang giu': 'holder', 'nguoi su dung': 'holder', 'so huu': 'owner',
  'phong ban': 'pb', 'loai': 'cat', 'loai thiet bi': 'cat',
  'hang': 'brand', 'model': 'model', 'so seri': 'serial', 'seri': 'serial', 'serial': 'serial',
}
const hkey = (s: unknown) => normalizeVi(String(s ?? '').replace(/\*/g, ''))
// Object.hasOwn: tiêu đề "constructor" / "toString"… không bị coi là cột vai trò
const roleOf = (s: unknown): Role | null => { const k = hkey(s); return Object.hasOwn(ROLE, k) ? ROLE[k] : null }
// Ô đánh dấu Loại ở dòng 2 file mẫu: "Loại: PC [mã: pc] — không sửa ô này". Tên sheet Excel bị cắt / đổi
// ký tự (tối đa 31, cấm [ ] : * ? / \) nên dựa vào ô này để nhận đúng Loại khi nhập lại.
const MARK_RE = /Loại:\s*(.*?)\s*\[mã:\s*([^\]\s]+)\s*\]/

// Giá trị "rác" máy quét ghi khi BIOS / màn hình không khai (cả ô chỉ có vậy) → coi như trống
const JUNK = new Set(['system manufacturer', 'system product name', 'system serial number', 'system version', 'default string',
  'o.e.m.', 'oem', 'none', 'n/a', 'not applicable', 'unknown', '16843009'])
export function cleanCell(v: unknown, junk?: Set<string>): string {
  const s = String(v ?? '').replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean).join('\n')
  const n = normalizeVi(s)
  if (s && (JUNK.has(n) || /^to be filled by o\.?e\.?m/.test(n) || /^0+$/.test(n))) { junk?.add(s.length > 40 ? s.slice(0, 40) + '…' : s); return '' }
  return s
}

export interface ImportRow {
  sheet: string; line: number; code: string
  catKey: string | null   // Loại có sẵn — null = Loại mới (tạo khi nhập)
  catLabel: string
  brand: string; model: string; serial: string
  holder: string; pb: string
  specs: Record<string, string> // theo KEY trường thông số của Loại
  specTotal: number
  status: 'ok' | 'warn' | 'skip' | 'dup'
  msg: string
  include: boolean
}
export interface ImportPreview {
  date: string | null           // ngày ghi phiếu đọc được trong file (yyyy-mm-dd)
  rows: ImportRow[]
  sheets: { name: string; count: number }[]
  newCats: string[]
  ignored: Record<string, Record<string, number>> // tên Loại → cột không có trường → số ô có dữ liệu
  junk: string[]
  pbFix: [string, string][]
  nameFix: [string, string][]
  noHeader: string[]
}
export const willImport = (r: ImportRow) => r.status === 'ok' || r.status === 'warn' || (r.status === 'dup' && r.include)

const realIso = (y: number, m: number, d: number) => {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const t = new Date(iso + 'T00:00:00Z')
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Khoá so trùng thiết bị: seri + model (bỏ dấu, không phân biệt hoa thường) */
export const seriKey = (serial: string, model: string) => normalizeVi(serial) + '|' + normalizeVi(model)

/**
 * Đọc workbook → bảng xem trước. `existing` = mã tài sản đã có (chuẩn hoá normalizeVi);
 * `existingSeri` = seriKey → mã của thiết bị đã có (bắt trường hợp 1 máy ghi 2 lần / nhập lại file);
 * `people` = tên Nhân viên (để sửa hoa / thường cho khớp danh sách).
 */
export function parseWorkbook(sheets: SheetIn[], S: KhoSettings, existing: Set<string>, people: string[] = [], existingSeri: Map<string, string> = new Map()): ImportPreview {
  const junk = new Set<string>()
  // ignored dùng object KHÔNG có prototype: tên Loại / tên cột lấy từ file ("__proto__"…) không làm bẩn Object.prototype
  const out: ImportPreview = { date: null, rows: [], sheets: [], newCats: [], ignored: Object.create(null), junk: [], pbFix: [], nameFix: [], noHeader: [] }
  const findCat = (text: string): { key: string | null; label: string } | null => {
    const n = normalizeVi(text); if (!n) return null
    const exact = S.categories.find((c) => normalizeVi(c.label) === n)
    if (exact) return { key: exact.key, label: exact.label }
    const fresh = out.newCats.find((l) => normalizeVi(l) === n)
    if (fresh) return { key: null, label: fresh }
    // "Máy in laser" → Máy in (khớp nguyên cụm từ, ưu tiên tên Loại dài hơn)
    const word = [...S.categories].sort((a, b) => b.label.length - a.label.length)
      .find((c) => normalizeVi(c.label) && new RegExp(`(^| )${escRe(normalizeVi(c.label))}( |$)`).test(n))
    return word ? { key: word.key, label: word.label } : null
  }
  const newCat = (label: string) => { const l = label.trim().slice(0, 60); if (!out.newCats.some((x) => normalizeVi(x) === normalizeVi(l))) out.newCats.push(l); return { key: null, label: l } }

  for (const sh of sheets) {
    const aoa = sh.aoa || []
    if (!out.date) {
      const m = aoa.slice(0, 3).flat().map(String).join(' ').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (m) out.date = realIso(+m[3], +m[2], +m[1])
    }
    const h = aoa.slice(0, 10).findIndex((r) => (r || []).filter((c) => String(c ?? '').trim()).length >= 3 && (r || []).some((c) => ['hang', 'model', 'ma tai san'].includes(hkey(c))))
    if (h < 0) { out.noHeader.push(sh.name); continue }
    const head = (aoa[h] || []).map((c) => String(c ?? '').replace(/\*/g, '').trim())
    const role = head.map(roleOf)
    const col = (k: Role) => role.indexOf(k)
    const shared = col('owner') >= 0 || normalizeVi(sh.name).includes('dung chung')
    // Loại của sheet theo ô đánh dấu (file mẫu) — ưu tiên hơn tên sheet
    let sheetCat: { key: string | null; label: string } | null = null
    const mark = aoa.slice(0, h).flat().map((c) => String(c ?? '')).map((s) => s.match(MARK_RE)).find(Boolean)
    if (mark) {
      const byKey = S.categories.find((c) => c.key === mark[2])
      const byLabel = S.categories.find((c) => normalizeVi(c.label) === normalizeVi(mark[1]))
      sheetCat = byKey ? { key: byKey.key, label: byKey.label } : byLabel ? { key: byLabel.key, label: byLabel.label } : mark[1].trim() ? newCat(mark[1]) : null
    }
    let count = 0
    for (let i = h + 1; i < aoa.length; i++) {
      const r = aoa[i] || []
      if (!r.some((c) => String(c ?? '').trim())) continue
      const get = (k: Role) => (col(k) >= 0 ? cleanCell(r[col(k)], junk) : '')
      const catCell = get('cat')
      const cat = findCat(catCell) || sheetCat || findCat(sh.name) || newCat(catCell || sh.name)
      const fields = cat.key ? S.categories.find((c) => c.key === cat.key)!.specs : []
      const owner = get('owner')
      const row: ImportRow = {
        sheet: sh.name, line: i + 1, code: col('code') >= 0 ? String(r[col('code')] ?? '').trim() : '',
        catKey: cat.key, catLabel: cat.label,
        brand: get('brand').slice(0, 120), model: get('model').slice(0, 120), serial: get('serial').slice(0, 120),
        holder: (shared && col('holder') < 0 ? (owner ? SHARED_HOLDER : '') : get('holder')).slice(0, 120),
        pb: (shared && col('pb') < 0 ? owner : get('pb')).slice(0, 120),
        specs: {}, specTotal: fields.length, status: 'ok', msg: '', include: true,
      }
      head.forEach((hd, j) => {
        if (role[j] || !hd) return
        const v = cleanCell(r[j], junk); if (!v) return
        const f = fields.find((x) => hkey(x.label) === hkey(hd))
        if (f) row.specs[f.key] = v.slice(0, 300)
        else { const g = (out.ignored[cat.label] = out.ignored[cat.label] || Object.create(null)); g[hd] = (g[hd] || 0) + 1 }
      })
      out.rows.push(row); count++
    }
    if (count) out.sheets.push({ name: sh.name, count })
  }

  // Tên người: khớp danh sách Nhân viên thì lấy đúng cách viết trong danh sách ("NGUYỄN VĂN A" → "Nguyễn Văn A")
  const pmap = new Map(people.filter(Boolean).map((p) => [normalizeVi(p), p]))
  for (const r of out.rows) {
    const p = r.holder && r.holder !== SHARED_HOLDER ? pmap.get(normalizeVi(r.holder)) : undefined
    if (p && p !== r.holder) { if (!out.nameFix.some(([a]) => a === r.holder)) out.nameFix.push([r.holder, p]); r.holder = p }
  }
  // Phòng ban viết khác hoa / thường → cách viết chuẩn (chữ đầu hoa, phần sau không lẫn lộn), rồi tới nhiều nhất
  const tidy = (s: string) => (s[0] !== s[0].toLowerCase() ? 2 : 0) + (s.slice(1) === s.slice(1).toLowerCase() || s === s.toUpperCase() ? 1 : 0)
  const byPb = new Map<string, Map<string, number>>()
  for (const r of out.rows) if (r.pb) { const k = normalizeVi(r.pb); const m = byPb.get(k) || new Map(); m.set(r.pb, (m.get(r.pb) || 0) + 1); byPb.set(k, m) }
  for (const m of byPb.values()) {
    if (m.size < 2) continue
    const best = [...m.keys()].sort((a, b) => tidy(b) - tidy(a) || m.get(b)! - m.get(a)!)[0]
    for (const v of m.keys()) if (v !== best) { out.pbFix.push([v, best]); out.rows.forEach((r) => { if (r.pb === v) r.pb = best }) }
  }

  // Kiểm từng dòng
  const seenCode = new Map<string, string>(), seenSeri = new Map<string, string>()
  const many = out.sheets.length > 1
  for (const r of out.rows) {
    const where = `dòng ${r.line}${many ? ` sheet ${r.sheet}` : ''}`
    const bad = (msg: string) => { r.status = 'skip'; r.msg = msg }
    if (!r.code) { bad('Thiếu mã tài sản'); continue }
    const ce = assetCodeError(r.code); if (ce) { bad(ce); continue }
    const k = normalizeVi(r.code)
    if (seenCode.has(k)) { bad(`Trùng mã với ${seenCode.get(k)}`); continue }
    seenCode.set(k, where)
    if (existing.has(k)) { bad('Mã đã có trong app'); continue }
    if (r.serial) {
      const sk = seriKey(r.serial, r.model)
      const dupWith = existingSeri.has(sk) ? `${existingSeri.get(sk)} đã có trong app` : seenSeri.get(sk)
      if (dupWith) { r.status = 'dup'; r.msg = `Cùng seri + model với ${dupWith} — có thể là 1 thiết bị ghi 2 lần`; r.include = false; continue }
      seenSeri.set(sk, `${r.code} (${where})`)
    }
    const miss = r.catKey ? S.categories.find((c) => c.key === r.catKey)!.specs.filter((f) => f.required && !r.specs[f.key]) : []
    if (miss.length) { r.status = 'warn'; r.msg = 'Thiếu ' + miss.map((f) => f.label).join(', ') }
  }
  out.junk = [...junk]
  return out
}

/** Dòng gửi lên máy chủ (chỉ dòng sẽ nhập) */
export interface ImportPayloadRow {
  sheet: string; line: number; code: string; catKey: string | null; catLabel: string
  brand: string; model: string; serial: string; holder: string; pb: string; specs: Record<string, string>
}
export const toPayload = (r: ImportRow): ImportPayloadRow => ({
  sheet: r.sheet, line: r.line, code: r.code, catKey: r.catKey, catLabel: r.catLabel,
  brand: r.brand, model: r.model, serial: r.serial, holder: r.holder, pb: r.pb, specs: r.specs,
})

// Tên sheet Excel: tối đa 31 ký tự, không có [ ] : * ? / \
const sheetName = (s: string, used: Set<string>) => {
  const base = (s.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Loại').slice(0, 31)
  let n = base, i = 2
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 27)} (${i++})`
  used.add(n.toLowerCase()); return n
}

/** File mẫu: sheet Hướng dẫn + mỗi Loại 1 sheet (cột thông số theo Sửa giao diện hiện tại) */
export function buildTemplateSheets(S: KhoSettings, dateDDMMYYYY: string): SheetIn[] {
  const used = new Set<string>(['hướng dẫn'])
  const guide: Aoa = [
    ['HƯỚNG DẪN NHẬP THIẾT BỊ CŨ VÀO APP KHO IT'],
    [''],
    ['1. Mỗi sheet = 1 Loại thiết bị; ô B2 ghi Loại của sheet ("Loại: … [mã: …]") — KHÔNG sửa ô này. Muốn thêm Loại mới: thêm sheet đặt tên Loại đó, chép dòng tiêu đề của 1 sheet có sẵn, XOÁ ô B2 — app tự tạo Loại theo tên sheet khi nhập.'],
    ['2. Dòng 3 là tiêu đề cột — KHÔNG đổi tên cột. Dữ liệu ghi từ dòng 4. Sheet không có dòng nào thì bỏ qua.'],
    ['3. Mã tài sản: BẮT BUỘC, không trùng, tối đa 60 ký tự, không dùng dấu "/". Dòng trống mã sẽ không nhập (app liệt kê để sửa).'],
    [`4. Người sở hữu + Phòng ban: có tên → app ghi luôn người đang giữ. Trống → thiết bị để trong kho. Thiết bị dùng chung: ghi "${SHARED_HOLDER}" ở Người sở hữu, tên phòng / tầng ở Phòng ban.`],
    ['5. Cột thông số: tên cột = tên trường của Loại (Sửa giao diện → Loại & Thông số). Cột app chưa có trường → khi nhập để trống; muốn giữ thì thêm trường CÙNG TÊN ở Sửa giao diện trước khi nhập.'],
    ['6. Dòng 2: "Ngày ghi phiếu" — ngày ghi cho phiếu nhập / cấp phát (dạng dữ liệu cũ: không cấp số phiếu, không vào Phiếu chờ ký). App lấy ngày ở sheet đầu tiên có ghi ngày.'],
    ['7. Nhập lại nhiều lần được: dòng có Mã tài sản đã có trong app sẽ tự bỏ qua.'],
  ]
  return [
    { name: 'Hướng dẫn', aoa: guide },
    ...S.categories.map((c) => ({
      name: sheetName(c.label, used),
      aoa: [
        [`DANH SÁCH ${c.label.toUpperCase()} — mẫu nhập Kho IT`],
        [`Ngày ghi phiếu: ${dateDDMMYYYY}`, `Loại: ${c.label} [mã: ${c.key}] — không sửa ô này`],
        [...TEMPLATE_BASE, ...c.specs.map((f) => f.label)],
      ] as Aoa,
    })),
  ]
}
