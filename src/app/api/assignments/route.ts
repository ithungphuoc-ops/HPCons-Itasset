import { NextResponse } from 'next/server'

// Kho Tổng (30/09/2026): cấp phát / thu hồi / luân chuyển giờ lập bằng PHIẾU qua /api/moves
// (có in phiếu ký nhận, cộng trừ tồn kho trong cùng transaction). API cũ ngưng để không ai ghi
// thêm vào collection "assignments" cũ làm lệch số liệu. Dữ liệu cũ vẫn giữ nguyên để chuyển sang
// bằng scripts/migrate-kho-tong.ts.
const gone = () =>
  NextResponse.json({ error: 'Chức năng này đã chuyển sang lập phiếu Cấp phát / Thu hồi / Luân chuyển ở trang Thiết bị' }, { status: 410 })

export const POST = gone
export const PATCH = gone
