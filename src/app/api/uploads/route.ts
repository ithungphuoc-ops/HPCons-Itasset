import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireWriteAccess } from '@/lib/session'
import { putFile, storageReady } from '@/lib/r2'
import { PHOTO_MAX_BYTES } from '@/lib/kho/photos'

// POST /api/uploads — tải 1 ảnh phiếu lên R2 (ảnh thiết bị hoặc ảnh phiếu đã ký, 22/10/2026). Trình duyệt
// đã thu nhỏ trước (cạnh 1600px, JPEG) nên mỗi ảnh chỉ vài trăm KB — 1 ảnh / 1 lần gọi để không vượt
// giới hạn dung lượng request của Vercel. Trả về khoá ảnh để gắn vào phiếu.
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// Xem mấy byte đầu file để chắc là ảnh thật (không tin loại file trình duyệt khai)
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  const s = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp'
  return null
}

export async function POST(req: NextRequest) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  if (!storageReady()) return NextResponse.json({ error: 'Chưa cấu hình nơi lưu ảnh (R2) — báo Admin khai biến R2 cho app Kho IT' }, { status: 503 })
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'Chưa chọn ảnh' }, { status: 400 })
    if (!EXT[file.type]) return NextResponse.json({ error: 'Chỉ nhận ảnh JPG, PNG, WEBP' }, { status: 400 })
    if (file.size > PHOTO_MAX_BYTES) return NextResponse.json({ error: 'Ảnh quá lớn (tối đa 4 MB)' }, { status: 400 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniff(bytes)
    if (!type) return NextResponse.json({ error: 'File không phải ảnh JPG, PNG, WEBP' }, { status: 400 })
    const now = new Date()
    const key = `itasset/phieu/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXT[type]}`
    await putFile(key, bytes, type)
    return NextResponse.json({ data: { key, name: (file.name || 'anh.jpg').slice(0, 120), size: file.size } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
