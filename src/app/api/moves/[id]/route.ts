import { NextRequest, NextResponse } from 'next/server'
import { deleteMove, getMove, MoveError } from '@/lib/firestore/moves'
import { requireSession, requireWriteAccess } from '@/lib/session'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  const { id } = await params
  const move = await getMove(id)
  if (!move) return NextResponse.json({ error: 'Không tìm thấy phiếu' }, { status: 404 })
  return NextResponse.json({ data: move })
}

// Xoá phiếu lập nhầm — Admin + IT Staff (23/10/2026: IT Staff được mọi thứ trừ Cài đặt / Sửa giao diện);
// số tồn được trả lại như trước khi lập phiếu
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    const { id } = await params
    await deleteMove(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: err instanceof MoveError ? 400 : 500 })
  }
}
