// Cấu hình giao diện Kho IT do Admin tự sửa ở "Sửa giao diện" (Đợt 2, 01/10/2026). Lưu 1 document
// Firestore `settings/kho_it`; thiếu mục nào thì lấy MẶC ĐỊNH (= thiết kế Sếp chốt ở Đợt 1).
// Dùng chung client + server. Phần tính tồn kho / lịch sử phiếu KHÔNG cấu hình được (giữ cố định
// cho số liệu luôn đúng).
import { CATEGORY_LABEL, CATEGORY_ORDER, MOVE_DEFS, MOVE_ORDER, PRINT_DEFAULTS, SPEC_FIELDS, TINH_TRANG, type MoveType } from '@/lib/kho/config'

// Trường thông số: `key` cố định (là chỗ lưu giá trị trong device.specs), `label` đổi tên tự do —
// đổi tên không làm mất giá trị đã nhập. Trường mặc định có key = tên ban đầu.
export interface SpecField { key: string; label: string }
export interface CategoryDef { key: string; label: string; specs: SpecField[] }

// Trường bổ sung ở Thông tin chung — giá trị lưu ở device.extra[key]
export type ExtraType = 'text' | 'number' | 'date' | 'select'
export interface ExtraField { key: string; label: string; type: ExtraType; options: string[]; inList: boolean }

// Trường có sẵn đổi được tên hiển thị
export const BASE_FIELDS = ['asset_code', 'category', 'brand', 'model', 'serial_number', 'status', 'warranty'] as const
export type BaseField = (typeof BASE_FIELDS)[number]
export const BASE_FIELD_DEFAULT: Record<BaseField, string> = {
  asset_code: 'Mã tài sản', category: 'Loại', brand: 'Hãng', model: 'Model', serial_number: 'Số Seri', status: 'Trạng thái', warranty: 'Thời gian bảo hành',
}

// Cột bật/tắt được ở danh sách Thiết bị (Mã tài sản + Loại luôn hiện)
export const LIST_COLS = ['brand', 'model', 'serial_number', 'in', 'out', 'back', 'move', 'left', 'status', 'warranty'] as const
export type ListCol = (typeof LIST_COLS)[number]
export const LIST_COL_LABEL: Record<ListCol, string> = {
  brand: 'Hãng', model: 'Model', serial_number: 'Số Seri', in: 'Nhập kho', out: 'Đã cấp', back: 'Thu hồi', move: 'Luân chuyển', left: 'Tồn kho', status: 'Trạng thái', warranty: 'Bảo hành',
}
const LIST_DEFAULT: Record<ListCol, boolean> = { brand: true, model: true, serial_number: true, in: true, out: true, back: false, move: false, left: true, status: true, warranty: true }

// Ô Tổng quan
export type TileKind = 'total' | 'in_use' | 'in_stock' | 'broken' | 'liquidated' | 'units_left' | 'employees' | 'tasks' | 'category'
export const TILE_KIND_LABEL: Record<TileKind, string> = {
  total: 'Tổng thiết bị', in_use: 'Đang sử dụng', in_stock: 'Trong kho', broken: 'Hỏng', liquidated: 'Thanh lý',
  units_left: 'Số cái còn trong kho', employees: 'Nhân viên', tasks: 'Công việc chưa xong', category: 'Đếm theo 1 Loại',
}
export interface TileDef { id: string; kind: TileKind; label: string; arg?: string }

export interface PrintTypeCfg { title: string; sign: string[]; foot: string }
export interface PrintCfg {
  coName: string; coAddr: string; coTax: string; khoName: string; showLetter: boolean; showDN: boolean
  logo: string | null // data URL (đã thu nhỏ) — null = logo HP Cons mặc định
  types: Record<MoveType, PrintTypeCfg>
}

export interface KhoSettings {
  categories: CategoryDef[]
  conditions: string[]
  fieldLabels: Record<BaseField, string>
  extraFields: ExtraField[]
  listColumns: Record<ListCol, boolean>
  tiles: TileDef[]
  print: PrintCfg
  updatedAt?: string | null
  updatedBy?: string | null
}

export function defaultSettings(): KhoSettings {
  return {
    categories: CATEGORY_ORDER.map((k) => ({ key: k, label: CATEGORY_LABEL[k], specs: (SPEC_FIELDS[k] || []).map((s) => ({ key: s, label: s })) })),
    conditions: [...TINH_TRANG],
    fieldLabels: { ...BASE_FIELD_DEFAULT },
    extraFields: [],
    listColumns: { ...LIST_DEFAULT },
    tiles: [
      { id: 't1', kind: 'total', label: 'Tổng thiết bị' },
      { id: 't2', kind: 'in_use', label: 'Đang sử dụng' },
      { id: 't3', kind: 'in_stock', label: 'Trong kho' },
      { id: 't4', kind: 'broken', label: 'Hỏng' },
      { id: 't5', kind: 'employees', label: 'Nhân viên' },
      { id: 't6', kind: 'tasks', label: 'Công việc' },
    ],
    print: {
      coName: PRINT_DEFAULTS.coName, coAddr: PRINT_DEFAULTS.coAddr, coTax: PRINT_DEFAULTS.coTax, khoName: PRINT_DEFAULTS.khoName,
      showLetter: PRINT_DEFAULTS.showLetter, showDN: PRINT_DEFAULTS.showDN, logo: null,
      types: Object.fromEntries(MOVE_ORDER.map((t) => [t, { title: MOVE_DEFS[t].title, sign: [...MOVE_DEFS[t].sign], foot: '' }])) as Record<MoveType, PrintTypeCfg>,
    },
    updatedAt: null,
    updatedBy: null,
  }
}

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
// Key lưu dữ liệu: không được dạng __x__ (Firestore dành riêng) hay trùng thuộc tính sẵn có của object JS
const keyOk = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_\-À-ỹ .()/]{1,80}$/.test(v) && !/^__.*__$/.test(v) && !(v in Object.prototype)

/**
 * Chuẩn hoá cấu hình (từ Firestore hoặc từ trình duyệt gửi lên): bỏ giá trị lạ, giới hạn độ dài,
 * thiếu thì lấy mặc định. Không ném lỗi — lỗi nghiệp vụ (xoá Loại đang dùng…) kiểm ở API.
 */
export function normalizeSettings(raw: unknown): KhoSettings {
  const d = defaultSettings()
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<KhoSettings>

  const seenCat = new Set<string>()
  const categories = Array.isArray(r.categories)
    ? r.categories.flatMap((c) => {
        if (!c || !keyOk(c.key) || seenCat.has(c.key)) return []
        seenCat.add(c.key)
        const seenSpec = new Set<string>()
        const specs = (Array.isArray(c.specs) ? c.specs : []).flatMap((s) => {
          if (!s || !keyOk(s.key) || seenSpec.has(s.key)) return []
          seenSpec.add(s.key)
          return [{ key: s.key, label: str(s.label, 80) || s.key }]
        })
        return [{ key: c.key, label: str(c.label, 60) || c.key, specs }]
      })
    : d.categories

  const conditions = Array.isArray(r.conditions) ? [...new Set(r.conditions.map((x) => str(x, 60)).filter(Boolean))] : d.conditions

  const fieldLabels = { ...d.fieldLabels }
  if (r.fieldLabels && typeof r.fieldLabels === 'object') for (const k of BASE_FIELDS) { const v = str((r.fieldLabels as Record<string, unknown>)[k], 60); if (v) fieldLabels[k] = v }

  const seenEx = new Set<string>()
  const extraFields = Array.isArray(r.extraFields)
    ? r.extraFields.flatMap((f) => {
        if (!f || !keyOk(f.key) || seenEx.has(f.key)) return []
        seenEx.add(f.key)
        const type: ExtraType = ['text', 'number', 'date', 'select'].includes(f.type) ? f.type : 'text'
        const options = type === 'select' && Array.isArray(f.options) ? [...new Set(f.options.map((o) => str(o, 60)).filter(Boolean))] : []
        return [{ key: f.key, label: str(f.label, 60) || f.key, type, options, inList: !!f.inList }]
      })
    : []

  const listColumns = { ...d.listColumns }
  if (r.listColumns && typeof r.listColumns === 'object') for (const k of LIST_COLS) { const v = (r.listColumns as Record<string, unknown>)[k]; if (typeof v === 'boolean') listColumns[k] = v }

  const seenTile = new Set<string>()
  const tiles = Array.isArray(r.tiles)
    ? r.tiles.flatMap((t) => {
        if (!t || typeof t.id !== 'string' || seenTile.has(t.id) || typeof t.kind !== 'string' || !Object.hasOwn(TILE_KIND_LABEL, t.kind)) return []
        seenTile.add(t.id)
        return [{ id: t.id.slice(0, 40), kind: t.kind, label: str(t.label, 60) || TILE_KIND_LABEL[t.kind], ...(t.kind === 'category' ? { arg: str(t.arg, 80) } : {}) }]
      }).slice(0, 24)
    : d.tiles

  const p = (r.print && typeof r.print === 'object' ? r.print : {}) as Partial<PrintCfg>
  const logo = typeof p.logo === 'string' && p.logo.startsWith('data:image/') && p.logo.length < 400_000 ? p.logo : null
  const types = { ...d.print.types }
  if (p.types && typeof p.types === 'object') {
    for (const t of MOVE_ORDER) {
      const x = (p.types as Record<string, Partial<PrintTypeCfg>>)[t]
      if (!x) continue
      const sign = Array.isArray(x.sign) ? x.sign.map((s) => str(s, 60)).filter(Boolean).slice(0, 6) : types[t].sign
      types[t] = { title: str(x.title, 120) || types[t].title, sign: sign.length ? sign : types[t].sign, foot: str(x.foot, 600) }
    }
  }
  const print: PrintCfg = {
    coName: typeof p.coName === 'string' ? str(p.coName) : d.print.coName,
    coAddr: typeof p.coAddr === 'string' ? str(p.coAddr, 300) : d.print.coAddr,
    coTax: typeof p.coTax === 'string' ? str(p.coTax, 60) : d.print.coTax,
    khoName: typeof p.khoName === 'string' ? str(p.khoName, 60) : d.print.khoName,
    showLetter: typeof p.showLetter === 'boolean' ? p.showLetter : d.print.showLetter,
    showDN: typeof p.showDN === 'boolean' ? p.showDN : d.print.showDN,
    logo,
    types,
  }

  return {
    categories: categories.length ? categories : d.categories,
    conditions: conditions.length ? conditions : d.conditions,
    fieldLabels, extraFields, listColumns, tiles, print,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    updatedBy: typeof r.updatedBy === 'string' ? r.updatedBy : null,
  }
}

/* ---------- tiện ích tra cứu ---------- */
export function catLabel(s: KhoSettings, key: string): string {
  return s.categories.find((c) => c.key === key)?.label || CATEGORY_LABEL[key as keyof typeof CATEGORY_LABEL] || key
}
export function specFieldsOf(s: KhoSettings, key: string): SpecField[] {
  return s.categories.find((c) => c.key === key)?.specs || []
}
export function deviceNameS(s: KhoSettings, d: { category: string; brand?: string | null; model?: string | null }): string {
  return [catLabel(s, d.category), d.brand, d.model].filter(Boolean).join(' · ')
}
export function newKey(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
