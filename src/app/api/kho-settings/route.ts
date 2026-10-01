import { NextRequest, NextResponse } from 'next/server'
import { getKhoSettings, saveKhoSettings } from '@/lib/firestore/settings'
import { listAllDevices } from '@/lib/firestore/devices'
import { requireAdmin, requireSession } from '@/lib/session'
import { normalizeSettings } from '@/lib/kho/settings'

// GET: mọi người đã đăng nhập (các trang cần để hiện đúng tên Loại, thông số, mẫu phiếu…)
export async function GET() {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  return NextResponse.json({ data: await getKhoSettings() })
}

// PUT: chỉ Admin — lưu toàn bộ cấu hình "Sửa giao diện"
export async function PUT(req: NextRequest) {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
    // Kiểm tra TRƯỚC khi chuẩn hoá: normalizeSettings() tự lấy mặc định khi danh sách rỗng — nếu để
    // nó chạy trước thì gửi danh sách rỗng sẽ âm thầm reset về mặc định (mất các chỉnh sửa).
    const raw = body as Record<string, unknown>
    if (!Array.isArray(raw.categories) || !raw.categories.length) return NextResponse.json({ error: 'Phải còn ít nhất 1 Loại thiết bị' }, { status: 400 })
    if (!Array.isArray(raw.conditions) || !raw.conditions.some((c) => typeof c === 'string' && c.trim())) return NextResponse.json({ error: 'Phải còn ít nhất 1 Tình trạng' }, { status: 400 })
    for (const k of ['extraFields', 'tiles', 'taskPeople'] as const) if (raw[k] !== undefined && !Array.isArray(raw[k])) return NextResponse.json({ error: `Dữ liệu "${k}" không hợp lệ` }, { status: 400 })
    for (const k of ['fieldLabels', 'listColumns', 'print'] as const) if (raw[k] !== undefined && (typeof raw[k] !== 'object' || raw[k] === null || Array.isArray(raw[k]))) return NextResponse.json({ error: `Dữ liệu "${k}" không hợp lệ` }, { status: 400 })
    const next = normalizeSettings(body)
    // Mục nào bị loại khi làm sạch (key lạ, trùng, kiểu ô không có…) → báo lỗi, không lưu nửa vời
    const lost: string[] = []
    if (next.categories.length !== raw.categories.length) lost.push('Loại')
    if (Array.isArray(raw.extraFields) && next.extraFields.length !== raw.extraFields.length) lost.push('trường bổ sung')
    if (Array.isArray(raw.tiles) && next.tiles.length !== Math.min(raw.tiles.length, 24)) lost.push('ô Tổng quan')
    if (lost.length) return NextResponse.json({ error: `Có ${lost.join(', ')} không hợp lệ (mã trùng / tên lạ) — tải lại trang rồi sửa lại` }, { status: 400 })

    // Không cho xoá Loại đang có thiết bị dùng (đổi tên thoải mái — mã Loại không đổi)
    const keep = new Set(next.categories.map((c) => c.key))
    const used = new Map<string, number>()
    for (const d of await listAllDevices()) if (!keep.has(d.category)) used.set(d.category, (used.get(d.category) || 0) + 1)
    if (used.size) {
      const cur = await getKhoSettings()
      const name = (k: string) => cur.categories.find((c) => c.key === k)?.label || k
      return NextResponse.json({ error: `Không xoá được Loại đang có thiết bị: ${[...used].map(([k, n]) => `${name(k)} (${n} thiết bị)`).join(', ')}. Đổi Loại cho các thiết bị đó trước.` }, { status: 400 })
    }
    const saved = await saveKhoSettings(next, session.email)
    return NextResponse.json({ data: saved })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
