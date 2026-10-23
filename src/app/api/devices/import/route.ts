import { NextRequest, NextResponse } from 'next/server'
import { requireWriteAccess } from '@/lib/session'
import { ImportError, importDevices } from '@/lib/firestore/importDevices'

// POST /api/devices/import — nhập thiết bị cũ từ Excel (Admin + IT Staff, Sếp duyệt 23/10/2026).
// Trình duyệt đọc file + xem trước, gửi lên các dòng sẽ nhập; máy chủ kiểm lại rồi ghi.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  // 2000 thiết bị ≈ 0,6 MB — chặn gói quá lớn trước khi đọc
  if (Number(req.headers.get('content-length') || 0) > 5_000_000) return NextResponse.json({ error: 'Dữ liệu quá lớn — chia file làm nhiều lần' }, { status: 413 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  try {
    const data = await importDevices(body, { email: session.email, name: session.profile?.fullName || session.email })
    return NextResponse.json({ data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ImportError ? 400 : 500 })
  }
}
