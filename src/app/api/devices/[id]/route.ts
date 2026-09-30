import { NextRequest, NextResponse } from 'next/server'
import {
  getDeviceById,
  findDeviceByAssetCode,
  updateDevice,
  deleteDevice,
  toDeviceJson,
} from '@/lib/firestore/devices'
import { countMovesForDevice, listMovesForDevice } from '@/lib/firestore/moves'
import { getActiveAssignmentForDevice } from '@/lib/firestore/assignments'
import { requireSession, requireWriteAccess } from '@/lib/session'
import { CATEGORY_ORDER, STATUS_ORDER } from '@/lib/kho/config'
import type { DeviceCategory, DeviceStatus } from '@/lib/firestore/types'

// Chi tiết thiết bị + toàn bộ phiếu có thiết bị này (1 query array-contains)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession()
    const { id } = await params
    const device = await getDeviceById(id)
    if (!device) return NextResponse.json({ error: 'Không tìm thấy thiết bị' }, { status: 404 })
    const moves = await listMovesForDevice(id)
    return NextResponse.json({ data: toDeviceJson(device), moves })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

const str = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null)
const date = (v: unknown) => {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Sửa "Thông tin chung" + Thông số kĩ thuật (bấm Lưu ở trang chi tiết). KHÔNG sửa được số tồn
// ở đây — số tồn chỉ đổi qua phiếu (lib/firestore/moves.ts).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const current = await getDeviceById(id)
    if (!current) return NextResponse.json({ error: 'Không tìm thấy thiết bị' }, { status: 404 })

    const update: Parameters<typeof updateDevice>[1] = {}
    if (body.asset_code !== undefined) {
      const code = str(body.asset_code)
      if (!code) return NextResponse.json({ error: 'Mã tài sản không được để trống' }, { status: 400 })
      if (code !== current.assetCode) {
        const dup = await findDeviceByAssetCode(code)
        if (dup && dup.id !== id) return NextResponse.json({ error: `Mã tài sản "${code}" đã có trong danh mục` }, { status: 400 })
      }
      update.assetCode = code
    }
    if (body.category !== undefined) {
      if (!CATEGORY_ORDER.includes(body.category)) return NextResponse.json({ error: 'Loại không hợp lệ' }, { status: 400 })
      update.category = body.category as DeviceCategory
    }
    if (body.status !== undefined) {
      if (!STATUS_ORDER.includes(body.status)) return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
      update.status = body.status as DeviceStatus
    }
    if (body.brand !== undefined) update.brand = str(body.brand) ?? ''
    if (body.model !== undefined) update.model = str(body.model) ?? ''
    if (body.serial_number !== undefined) update.serialNumber = str(body.serial_number)
    if (body.warranty_from !== undefined) update.warrantyFrom = date(body.warranty_from)
    if (body.warranty_expiry !== undefined) update.warrantyExpiry = date(body.warranty_expiry)
    if (body.notes !== undefined) update.notes = str(body.notes)
    if (body.image_url !== undefined) update.imageUrl = str(body.image_url)
    if (body.specs !== undefined && body.specs && typeof body.specs === 'object') {
      const specs: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.specs as Record<string, unknown>)) {
        // Giữ cả ô trống ('') — updateDevice ghi kiểu merge, bỏ key đi thì giá trị cũ sẽ không bị xoá
        specs[String(k).slice(0, 80)] = (str(v) ?? '').slice(0, 300)
      }
      update.specs = specs
    }

    await updateDevice(id, update)
    const saved = await getDeviceById(id)
    return NextResponse.json({ data: saved ? toDeviceJson(saved) : null })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// Chỉ xoá được thiết bị CHƯA có phiếu nào (tránh mất lịch sử / lệch số liệu)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    if (await countMovesForDevice(id)) {
      return NextResponse.json({ error: 'Thiết bị đã có phiếu nhập / cấp phát — không xoá được. Muốn ngưng dùng thì đổi Trạng thái sang "Thanh lý".' }, { status: 400 })
    }
    if (await getActiveAssignmentForDevice(id)) {
      return NextResponse.json({ error: 'Thiết bị còn lượt cấp phát cũ chưa chuyển dữ liệu — không xoá được' }, { status: 400 })
    }
    await deleteDevice(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
