import { NextRequest, NextResponse } from 'next/server'
import { createDevice, findDeviceByAssetCode, listAllDevices, toDeviceJson } from '@/lib/firestore/devices'
import { assetCodeError, normalizeVi } from '@/lib/kho/config'
import { requireWriteAccess } from '@/lib/session'
import { getKhoSettings } from '@/lib/firestore/settings'
import { missingSpecs, specFieldsOf } from '@/lib/kho/settings'

// Thêm mã mới vào Danh mục thiết bị (5 cột Sếp chốt: Mã tài sản · Loại · Hãng · Model · Số Seri).
// Tồn = 0 khi tạo; số lượng vào kho qua phiếu Nhập kho.
// 10/10/2026: Sếp giữ nút này để tự chuyển dữ liệu cũ → nhận thêm thông số theo Loại. Thiếu ô bắt
// buộc vẫn lưu được (dữ liệu cũ có khi không đủ) — thiết bị hiện nhãn "Thiếu thông số" và lần Nhập
// kho sau bắt điền nốt. Đủ thì khoá thông số luôn.
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  const assetCode = String(body.asset_code || '').trim()
  const brand = String(body.brand || '').trim().slice(0, 120)
  const model = String(body.model || '').trim().slice(0, 120)
  const category = body.category

  const settings = await getKhoSettings()
  if (!assetCode || !settings.categories.some((c) => c.key === category)) {
    return NextResponse.json({ error: 'Cần nhập Mã tài sản và chọn Loại' }, { status: 400 })
  }
  const codeErr = assetCodeError(assetCode)
  if (codeErr) return NextResponse.json({ error: codeErr }, { status: 400 })
  // Trùng theo kiểu bỏ dấu / không phân biệt hoa thường ("lt-001" = "LT-001") + khớp chính xác (cache)
  const hit = (await listAllDevices()).find((d) => normalizeVi(d.assetCode) === normalizeVi(assetCode)) || (await findDeviceByAssetCode(assetCode))
  if (hit) {
    return NextResponse.json({ error: `Mã tài sản "${assetCode}" đã có trong danh mục${hit.assetCode !== assetCode ? ` (${hit.assetCode})` : ''}` }, { status: 400 })
  }

  const raw = (body.specs && typeof body.specs === 'object' ? body.specs : {}) as Record<string, unknown>
  const specs: Record<string, string> = {}
  for (const f of specFieldsOf(settings, category)) { const v = typeof raw[f.key] === 'string' ? (raw[f.key] as string).trim().slice(0, 300) : ''; if (v) specs[f.key] = v }
  const complete = !missingSpecs(settings, category, specs).length

  const device = await createDevice({
    assetCode,
    category,
    brand,
    model,
    serialNumber: String(body.serial_number || '').trim().slice(0, 120) || null,
    status: 'in_stock',
    quantity: 0,
    specs: Object.keys(specs).length ? specs : null,
    specsLock: complete ? { at: new Date().toISOString(), by: session.email, so: null, via: 'add' } : null,
  })
  return NextResponse.json({ data: toDeviceJson(device) })
}
