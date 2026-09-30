import { NextRequest, NextResponse } from 'next/server'
import { findEmployeeByEmail } from '@/lib/firestore/employees'
import { personHoldings } from '@/lib/firestore/moves'
import { getSession, hasDashboardAccess } from '@/lib/session'

// Thiết bị đang giữ của 1 người — Kho Tổng (30/09/2026): tính từ phiếu Cấp phát / Thu hồi /
// Luân chuyển có tên người này. Tên trong phiếu GÕ TAY → so khớp theo họ tên đã bỏ dấu với hồ sơ
// nhân viên (gõ sai chính tả trong phiếu thì sẽ không hiện ở đây).
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ devices: [] })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  if (session.email !== email && !hasDashboardAccess(session)) {
    return NextResponse.json({ error: 'Không có quyền xem dữ liệu này' }, { status: 403 })
  }

  const employee = await findEmployeeByEmail(email)
  if (!employee) return NextResponse.json({ devices: [], employee_code: null })

  const { holdings } = await personHoldings(employee.fullName)
  const devices = holdings.map(({ device, qty, since }) => ({
    id: device.id,
    brand: device.brand,
    model: device.model,
    asset_code: device.assetCode,
    category: device.category,
    serial_number: device.serialNumber,
    status: device.status,
    assigned_date: since,
    quantity: qty,
  }))

  return NextResponse.json({ devices, employee_code: employee.employeeCode })
}
