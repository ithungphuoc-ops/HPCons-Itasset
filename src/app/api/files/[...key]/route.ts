import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getFile } from '@/lib/r2'
import { PHOTO_KEY_RE } from '@/lib/kho/photos'

// GET /api/files/itasset/phieu/… — xem ảnh phiếu (cần đăng nhập). Khoá ảnh là duy nhất (đổi ảnh = khoá
// mới) nên cho trình duyệt giữ lâu, mở lại không tốn lượt tải.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  const { key: parts } = await params
  const key = parts.join('/')
  if (!PHOTO_KEY_RE.test(key)) return NextResponse.json({ error: 'Không tìm thấy ảnh' }, { status: 404 })
  const f = await getFile(key)
  if (!f) return NextResponse.json({ error: 'Không tìm thấy ảnh' }, { status: 404 })
  return new NextResponse(Buffer.from(f.bytes), {
    headers: { 'Content-Type': f.contentType, 'Cache-Control': 'private, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff' },
  })
}
