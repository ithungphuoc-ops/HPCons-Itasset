import { NextRequest, NextResponse } from 'next/server'
import { listAllDevices, toDeviceJson } from '@/lib/firestore/devices'
import { requireSession } from '@/lib/session'
import { normalizeVi } from '@/lib/kho/config'

// Kho Tổng (30/09/2026): số Nhập / Đã cấp / Thu hồi / Tồn đã lưu sẵn trên từng thiết bị
// (devices.stock) → chỉ đọc 1 collection (có cache 30s), không còn đọc thêm assignments +
// từng nhân viên như trước. Ai đang giữ thì xem ở trang chi tiết.
export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const search = normalizeVi(searchParams.get('search') || '')
    const category = searchParams.get('category') || ''
    const status = searchParams.get('status') || ''

    let devices = await listAllDevices()
    if (category) devices = devices.filter((d) => d.category === category)
    if (status) devices = devices.filter((d) => d.status === status)
    if (search) {
      devices = devices.filter((d) =>
        [d.assetCode, d.serialNumber || '', d.brand, d.model].some((x) => normalizeVi(x).includes(search)),
      )
    }
    return NextResponse.json({ data: devices.map(toDeviceJson) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
