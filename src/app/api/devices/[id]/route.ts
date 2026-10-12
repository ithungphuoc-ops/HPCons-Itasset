import { NextRequest, NextResponse } from 'next/server'
import {
  getDeviceById,
  findDeviceByAssetCode,
  updateDevice,
  deleteDevice,
  toDeviceJson,
  specsOf,
  listAllDevices,
} from '@/lib/firestore/devices'
import { countMovesForDevice, listMovesForDevice } from '@/lib/firestore/moves'
import { getActiveAssignmentForDevice } from '@/lib/firestore/assignments'
import { isAdmin, requireSession, requireWriteAccess } from '@/lib/session'
import { STATUS_ORDER, assetCodeError, normalizeVi } from '@/lib/kho/config'
import { getKhoSettings } from '@/lib/firestore/settings'
import { catLabel, missingSpecs, specFieldsOf } from '@/lib/kho/settings'
import type { DeviceCategory, DeviceStatus, SpecLogEntry } from '@/lib/firestore/types'

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
// 10/10/2026 — thông số khoá: Mã · Loại · Hãng · Model · Seri + ô thông số ĐÃ CÓ giá trị chỉ Admin
// sửa được và phải ghi lý do (body.reason); ô đang trống ai có quyền ghi cũng điền được. Mọi thay
// đổi các ô này ghi vào specsLog. Bảo hành, trạng thái, trường bổ sung vẫn sửa như cũ.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session
  try {
    session = await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
    const current = await getDeviceById(id)
    if (!current) return NextResponse.json({ error: 'Không tìm thấy thiết bị' }, { status: 404 })

    const update: Parameters<typeof updateDevice>[1] = {}
    if (body.asset_code !== undefined) {
      const code = str(body.asset_code)
      if (!code) return NextResponse.json({ error: 'Mã tài sản không được để trống' }, { status: 400 })
      if (code !== current.assetCode) {
        const codeErr = assetCodeError(code)
        if (codeErr) return NextResponse.json({ error: codeErr }, { status: 400 })
        // Trùng theo kiểu bỏ dấu / không phân biệt hoa thường (trừ chính nó) + khớp chính xác
        const dup = (await listAllDevices()).find((d) => d.id !== id && normalizeVi(d.assetCode) === normalizeVi(code)) || (await findDeviceByAssetCode(code))
        if (dup && dup.id !== id) return NextResponse.json({ error: `Mã tài sản "${code}" đã có trong danh mục` }, { status: 400 })
      }
      update.assetCode = code
    }
    if (body.category !== undefined) {
      const settings = await getKhoSettings()
      if (!settings.categories.some((c) => c.key === body.category)) return NextResponse.json({ error: 'Loại không hợp lệ' }, { status: 400 })
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
        if (/^__.*__$/.test(k) || !k.trim()) continue // Firestore cấm tên field dạng __x__ (sẽ lỗi 500)
        // Giữ cả ô trống ('') — updateDevice ghi kiểu merge, bỏ key đi thì giá trị cũ sẽ không bị xoá
        specs[String(k).slice(0, 80)] = (str(v) ?? '').slice(0, 300)
      }
      update.specs = specs
    }

    // Trường bổ sung (Sửa giao diện) — chỉ nhận đúng các key đang cấu hình; giữ cả ô trống để xoá được giá trị cũ
    if (body.extra !== undefined && body.extra && typeof body.extra === 'object') {
      const keys = new Set((await getKhoSettings()).extraFields.map((f) => f.key))
      const extra: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.extra as Record<string, unknown>)) if (keys.has(k)) extra[k] = (str(v) ?? '').slice(0, 300)
      update.extra = extra
    }

    // ---- Khoá thông số: tách thay đổi thành "điền ô trống" (ai cũng được) và "sửa giá trị đã có" (Admin + lý do)
    const settings = await getKhoSettings()
    const L = settings.fieldLabels
    const curSpecs = specsOf(current)
    const edits: { field: string; from: string; to: string }[] = []
    const fills: { field: string; from: string; to: string }[] = []
    const track = (label: string, from: string | null | undefined, to: string | null | undefined) => {
      const a = (from ?? '').trim(), b = (to ?? '').trim()
      if (a === b) return
      ;(a ? edits : fills).push({ field: label, from: a, to: b })
    }
    if (update.assetCode !== undefined) track(L.asset_code, current.assetCode, update.assetCode)
    if (update.category !== undefined) track(L.category, catLabel(settings, current.category), catLabel(settings, update.category))
    if (update.brand !== undefined) track(L.brand, current.brand, update.brand)
    if (update.model !== undefined) track(L.model, current.model, update.model)
    if (update.serialNumber !== undefined) track(L.serial_number, current.serialNumber, update.serialNumber)
    if (update.specs) {
      const labelOf = (k: string) => specFieldsOf(settings, update.category ?? current.category).find((f) => f.key === k)?.label || k
      for (const [k, v] of Object.entries(update.specs)) track(labelOf(k), curSpecs[k], v)
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
    if (edits.length && !isAdmin(session)) {
      return NextResponse.json({ error: `Thông số đã khoá — chỉ Admin sửa được (${edits.map((c) => c.field).join(', ')}). Ô còn trống thì điền được.` }, { status: 403 })
    }
    if (edits.length && !reason) return NextResponse.json({ error: 'Sửa thông số đã khoá phải ghi lý do' }, { status: 400 })
    const now = new Date().toISOString()
    const logs: SpecLogEntry[] = []
    if (fills.length) logs.push({ at: now, by: session.email, kind: 'fill', reason: null, changes: fills })
    if (edits.length) logs.push({ at: now, by: session.email, kind: 'edit', reason, changes: edits })
    if (logs.length) update.specsLogAdd = logs
    // Thiết bị cũ vừa đủ thông số bắt buộc lần đầu → khoá từ lúc này
    if (!current.specsLock && !missingSpecs(settings, update.category ?? current.category, { ...curSpecs, ...(update.specs || {}) }).length) {
      update.specsLock = { at: now, by: session.email, so: null, via: 'fill' }
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
