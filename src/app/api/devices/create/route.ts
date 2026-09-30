import { NextRequest, NextResponse } from 'next/server'
import { createDevice, findDeviceByAssetCode, toDeviceJson } from '@/lib/firestore/devices'
import { requireWriteAccess } from '@/lib/session'
import { CATEGORY_ORDER } from '@/lib/kho/config'

// Thêm mã mới vào Danh mục thiết bị (5 cột Sếp chốt: Mã tài sản · Loại · Hãng · Model · Số Seri).
// Tồn = 0 khi tạo; số lượng vào kho qua phiếu Nhập kho.
export async function POST(req: NextRequest) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const assetCode = String(body.asset_code || '').trim()
  const brand = String(body.brand || '').trim()
  const model = String(body.model || '').trim()
  const category = body.category

  if (!assetCode || !CATEGORY_ORDER.includes(category)) {
    return NextResponse.json({ error: 'Cần nhập Mã tài sản và chọn Loại' }, { status: 400 })
  }
  if (await findDeviceByAssetCode(assetCode)) {
    return NextResponse.json({ error: `Mã tài sản "${assetCode}" đã có trong danh mục` }, { status: 400 })
  }

  const device = await createDevice({
    assetCode,
    category,
    brand,
    model,
    serialNumber: String(body.serial_number || '').trim() || null,
    status: 'in_stock',
    quantity: 0,
  })
  return NextResponse.json({ data: toDeviceJson(device) })
}
