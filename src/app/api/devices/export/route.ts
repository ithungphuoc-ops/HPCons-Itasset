import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { listAllDevices, toDeviceJson } from '@/lib/firestore/devices'
import { fmtDate } from '@/lib/kho/config'
import { getKhoSettings } from '@/lib/firestore/settings'
import { catLabel, specFieldsOf } from '@/lib/kho/settings'
import { requireSession } from '@/lib/session'

const STATUS: Record<string, string> = {
  in_use: 'Đang dùng', in_stock: 'Trong kho', broken: 'Hỏng', liquidated: 'Thanh lý',
}

export async function GET() {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  // Kho Tổng (30/09/2026): xuất theo cột mới — số liệu tồn lấy sẵn trên thiết bị, không đọc thêm
  // lịch sử / nhân viên (tiết kiệm lượt đọc). Người đang giữ xem ở trang chi tiết.
  const [devices, S] = await Promise.all([listAllDevices(), getKhoSettings()])
  const L = S.fieldLabels
  const rows = devices.map((d) => {
    const j = toDeviceJson(d)
    return {
      [L.asset_code]: d.assetCode,
      [L.category]: catLabel(S, d.category),
      [L.brand]: d.brand,
      [L.model]: d.model,
      [L.serial_number]: d.serialNumber || '',
      'Nhập kho': j.stock.in,
      'Đã cấp': j.stock.out,
      'Thu hồi': j.stock.back,
      'Luân chuyển': j.stock.move,
      'Tồn kho': j.stock.left,
      [L.status]: STATUS[d.status] || d.status,
      'Bảo hành từ': fmtDate(d.warrantyFrom),
      'Bảo hành đến': fmtDate(d.warrantyExpiry),
      ...Object.fromEntries(S.extraFields.map((f) => [f.label, j.extra?.[f.key] || ''])),
      // Thông số: tên trường theo Loại của thiết bị (đổi tên ở Sửa giao diện vẫn ra đúng)
      ...Object.fromEntries(Object.entries(j.specs).filter(([, v]) => v).map(([k, v]) => [specFieldsOf(S, d.category).find((x) => x.key === k)?.label || k, v])),
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
    { wch: 10 }, { wch: 24 }, { wch: 12 }, { wch: 22 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 20 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách thiết bị')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const today = new Date().toISOString().split('T')[0]

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ThietBi_KhoIT_${today}.xlsx"`,
    },
  })
}
