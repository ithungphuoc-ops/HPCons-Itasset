import { NextResponse } from 'next/server'

// Kho Tổng (30/09/2026): nhập thiết bị từ Excel / PDF TẠM ẨN (Sếp đồng ý trong kế hoạch Đợt 1) —
// đường cũ ghi `quantity` + collection `assignments` cũ, không đi qua phiếu nên làm lệch số tồn.
// Muốn dùng lại thì làm lại theo luồng mới: tạo mã trong danh mục + lập phiếu Nhập kho (/api/moves).
// Bản cũ còn trong lịch sử git (trước commit Kho Tổng).
export async function POST() {
  return NextResponse.json({ error: 'Nhập thiết bị từ Excel / PDF đang tạm ẩn — thêm thiết bị ở trang Thiết bị rồi lập phiếu Nhập kho' }, { status: 410 })
}
