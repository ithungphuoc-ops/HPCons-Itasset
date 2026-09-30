// Cấu hình nghiệp vụ Kho Tổng (Đợt 1, 30/09/2026) — theo đúng file thiết kế Sếp chốt
// (yeu-cau-kho-tong.json + demo "Demo Phieu in Kho IT.html"). Dùng chung client + server.
// Đợt 2 ("Sửa giao diện") sẽ cho Admin sửa các danh sách này và lưu Firestore; lúc đó các hằng
// dưới đây trở thành giá trị MẶC ĐỊNH khi chưa có cấu hình lưu.

import type { DeviceCategory, DeviceStatus } from '@/lib/types'

export const APP_NAME = 'Kho Tổng'

export interface KhoInfo { slug: string; name: string; desc: string; color: string; ready: boolean; href: string }
export const KHO_LIST: KhoInfo[] = [
  { slug: 'it', name: 'Kho IT', desc: 'Thiết bị CNTT, cấp phát, công việc IT', color: '#2563eb', ready: true, href: '/dashboard/it' },
  { slug: 'vpp', name: 'Kho VPP', desc: 'Văn phòng phẩm', color: '#d97706', ready: false, href: '/dashboard/kho/vpp' },
  { slug: 'thi-cong', name: 'Kho Thi công', desc: 'Vật tư, dụng cụ thi công', color: '#059669', ready: false, href: '/dashboard/kho/thi-cong' },
  { slug: 'chon-thanh', name: 'Kho Chơn Thành', desc: '', color: '#7c3aed', ready: false, href: '/dashboard/kho/chon-thanh' },
]

// Thứ tự theo thiết kế Sếp (Laptop / PC / Màn hình / ...), mã giữ nguyên enum cũ để không phải đổi dữ liệu
export const CATEGORY_ORDER: DeviceCategory[] = ['laptop', 'pc', 'monitor', 'printer', 'networking', 'component', 'ups', 'peripheral', 'other']
export const CATEGORY_LABEL: Record<DeviceCategory, string> = {
  laptop: 'Laptop', pc: 'PC', monitor: 'Màn hình', printer: 'Máy in', networking: 'Thiết bị mạng',
  component: 'Linh kiện', ups: 'UPS', peripheral: 'Phụ kiện', other: 'Khác',
}

export const STATUS_ORDER: DeviceStatus[] = ['in_use', 'in_stock', 'broken', 'liquidated']
export const STATUS_LABEL: Record<DeviceStatus, string> = {
  in_use: 'Đang dùng', in_stock: 'Trong kho', broken: 'Hỏng', liquidated: 'Thanh lý',
}
export const STATUS_COLOR: Record<DeviceStatus, string> = {
  in_use: 'bg-green-500/20 text-green-400',
  in_stock: 'bg-blue-500/20 text-blue-400',
  broken: 'bg-red-500/20 text-red-400',
  liquidated: 'bg-gray-500/20 text-gray-400',
}

// Thông số kĩ thuật RIÊNG theo Loại — đúng danh sách trường Sếp đã tự thiết kế
export const SPEC_FIELDS: Partial<Record<DeviceCategory, string[]>> = {
  monitor: ['Màu', 'Độ sáng', 'Màu sắc hiển thị', 'Loại màn hình', 'Kích cỡ màn hình', 'Tấm nền', 'Góc nhìn',
    'Tốc độ phản hồi', 'sRGB', 'Cổng kết nối', 'Tỉ lệ khung hình', 'Tần số quét', 'Độ phân giải', 'Góc xoay',
    'Đế treo ARM', 'Kích thước', 'Cân nặng (Sản phẩm/Full)', 'Tính năng đặc biệt'],
  laptop: ['CPU', 'Ram', 'Ổ cứng', 'VGA', 'Màn hình', 'Webcam', 'Cổng kết nối', 'Trọng lượng', 'Pin', 'Hệ điều hành'],
  pc: ['CPU', 'Main', 'Ram', 'Ổ cứng', 'VGA', 'Nguồn', 'Tản', 'Case'],
}

// Dữ liệu cũ (laptopSpecs/monitorSpecs thời Supabase) → tên trường mới, để hiện được ngay khi chưa
// có `specs` mới. Chỉ dùng để ĐỌC; lần Lưu đầu tiên sẽ ghi sang `specs`.
export const LEGACY_SPEC_MAP: Partial<Record<DeviceCategory, Record<string, string>>> = {
  laptop: { cpu: 'CPU', ram: 'Ram', storage: 'Ổ cứng', gpu: 'VGA', display: 'Màn hình', os: 'Hệ điều hành' },
  pc: { cpu: 'CPU', mainBoard: 'Main', ram: 'Ram', storage: 'Ổ cứng', gpu: 'VGA', powerSupply: 'Nguồn' },
  monitor: { screenSize: 'Kích cỡ màn hình', resolution: 'Độ phân giải', panelType: 'Tấm nền', refreshRate: 'Tần số quét' },
}

export const TINH_TRANG = ['Mới', 'Đang sử dụng', 'Đã qua sử dụng', 'Hư']

/* ---------- 4 loại phiếu ---------- */
export type MoveType = 'NK' | 'XK' | 'TH' | 'LC'
export const MOVE_ORDER: MoveType[] = ['NK', 'XK', 'TH', 'LC']

// Các ô thông tin đầu phiếu (gõ tay). key lưu trong move.info
export type InfoKey = 'ncc' | 'nguoi' | 'pb' | 'nguoi2' | 'pb2' | 'lydo' | 'dien'
export interface InfoField { key: InfoKey; label: string; required: boolean; wide?: boolean }

export interface MoveDef {
  label: string          // tên tab / nút
  history: string        // tên bảng lịch sử trong chi tiết thiết bị
  title: string          // tiêu đề phiếu in mặc định
  kho: string            // "Xuất tại kho" / "Nhập tại kho"...
  fields: InfoField[]
  sign: string[]         // ô ký tên mặc định
}

export const MOVE_DEFS: Record<MoveType, MoveDef> = {
  NK: {
    label: 'Nhập kho', history: 'Lịch sử nhập kho', title: 'PHIẾU NHẬP KHO', kho: 'Nhập tại kho',
    fields: [
      { key: 'ncc', label: 'Nhà cung cấp', required: true },
      { key: 'nguoi', label: 'Người nhập', required: true },
      { key: 'dien', label: 'Diễn giải', required: false, wide: true },
    ],
    sign: ['Người lập phiếu', 'Người giao hàng', 'Thủ kho', 'Trưởng bộ phận'],
  },
  XK: {
    label: 'Cấp phát', history: 'Lịch sử cấp phát', title: 'PHIẾU XUẤT KHO - CẤP PHÁT THIẾT BỊ', kho: 'Xuất tại kho',
    fields: [
      { key: 'nguoi', label: 'Họ và tên người nhận', required: true },
      { key: 'pb', label: 'Phòng ban', required: true },
      { key: 'lydo', label: 'Lý do cấp phát', required: true, wide: true },
    ],
    sign: ['Người lập phiếu', 'Người nhận', 'Thủ kho', 'Trưởng bộ phận'],
  },
  TH: {
    label: 'Thu hồi', history: 'Lịch sử thu hồi', title: 'PHIẾU THU HỒI THIẾT BỊ', kho: 'Nhập lại kho',
    fields: [
      { key: 'nguoi', label: 'Họ và tên người giao trả', required: true },
      { key: 'pb', label: 'Phòng ban', required: true },
      { key: 'lydo', label: 'Lý do thu hồi', required: true, wide: true },
    ],
    sign: ['Người lập phiếu', 'Người giao trả', 'Thủ kho', 'Trưởng bộ phận'],
  },
  LC: {
    label: 'Luân chuyển', history: 'Lịch sử luân chuyển', title: 'PHIẾU LUÂN CHUYỂN THIẾT BỊ', kho: 'Thuộc kho',
    fields: [
      { key: 'nguoi', label: 'Người chuyển', required: true },
      { key: 'pb', label: 'Phòng ban chuyển', required: true },
      { key: 'nguoi2', label: 'Người nhận', required: true },
      { key: 'pb2', label: 'Phòng ban nhận', required: true },
      { key: 'lydo', label: 'Lý do chuyển', required: true, wide: true },
    ],
    sign: ['Người lập phiếu', 'Người chuyển', 'Người nhận', 'Thủ kho'],
  },
}

// Mẫu phiếu in mặc định (Đợt 2 cho Admin sửa trong "Sửa giao diện → Mẫu phiếu in")
export const PRINT_DEFAULTS = {
  coName: 'Công ty Cổ phần Xây dựng Công nghiệp Hưng Phước',
  coAddr: 'B_4B3_CN, Khu công nghiệp Mỹ Phước 3, Phường Thới Hòa, Thành phố Hồ Chí Minh, Việt Nam.',
  coTax: '3703172689',
  khoName: 'Kho IT',
  showLetter: true,
  showDN: true,
}

/* ---------- tiện ích dùng chung ---------- */
export function normalizeVi(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, m => (m === 'đ' ? 'd' : 'D')).toLowerCase().trim().replace(/\s+/g, ' ')
}
export function deviceName(d: { category: DeviceCategory; brand?: string | null; model?: string | null }): string {
  return [CATEGORY_LABEL[d.category] || d.category, d.brand, d.model].filter(Boolean).join(' · ')
}
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function fmtDate(v?: string | null): string {
  if (!v) return '—'
  const p = v.slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v
}

// Số liệu tồn của 1 thiết bị. tồn = nhập − cấp + thu hồi; luân chuyển không đổi tồn.
export interface StockNumbers { in: number; out: number; back: number; move: number }
export function stockLeft(s: StockNumbers): number { return s.in - s.out + s.back }
export function stockHeld(s: StockNumbers): number { return s.out - s.back }
