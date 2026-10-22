import { NextRequest, NextResponse } from 'next/server'
import { addSignedPhotos, MoveError } from '@/lib/firestore/moves'
import { requireWriteAccess } from '@/lib/session'

// POST /api/moves/[id]/signed { photos: [{ key, name, size }] } — gắn ảnh phiếu đã in + ký (đã tải lên R2
// qua /api/uploads). Có ảnh là phiếu hết "Chờ ký" (22/10/2026).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session
  try {
    session = await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    const { id } = await params
    if (!id || id.includes('/') || /^__.*__$/.test(id)) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })
    const body = await req.json().catch(() => null)
    const move = await addSignedPhotos(id, body && typeof body === 'object' ? (body as { photos?: unknown }).photos : null, session.email)
    return NextResponse.json({ data: move })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof MoveError ? 400 : 500 })
  }
}
