import { NextRequest, NextResponse } from 'next/server'
import { createMove, listMovesForDevice, listRecentMoves, MoveError, type CreateMoveInput } from '@/lib/firestore/moves'
import { requireSession, requireWriteAccess } from '@/lib/session'

// GET /api/moves?deviceId=… → lịch sử phiếu của 1 thiết bị; ?recent=10 → phiếu mới nhất
export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    const deviceId = req.nextUrl.searchParams.get('deviceId')
    const recent = Number(req.nextUrl.searchParams.get('recent') || 0)
    if (deviceId) return NextResponse.json({ data: await listMovesForDevice(deviceId) })
    return NextResponse.json({ data: await listRecentMoves(Math.min(Math.max(recent, 1), 50)) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// POST /api/moves — lập phiếu (Nhập kho / Cấp phát / Thu hồi / Luân chuyển)
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    const body = (await req.json().catch(() => null)) as CreateMoveInput | null
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu phiếu không hợp lệ' }, { status: 400 })
    if (!Array.isArray(body.lines)) return NextResponse.json({ error: 'Phiếu chưa có thiết bị nào' }, { status: 400 })
    if (body.info !== undefined && (typeof body.info !== 'object' || body.info === null)) return NextResponse.json({ error: 'Dữ liệu phiếu không hợp lệ' }, { status: 400 })
    const move = await createMove(
      {
        type: body.type,
        date: body.date,
        info: body.info || {},
        dnSo: body.dnSo ?? null,
        dnDate: body.dnDate || null,
        lines: body.lines.map((l) => (l && typeof l === 'object'
          ? { deviceId: String(l.deviceId || ''), qty: Number(l.qty), condition: String(l.condition || ''), note: l.note == null ? null : String(l.note) }
          : (null as unknown as CreateMoveInput['lines'][number]))),
      },
      session.email,
    )
    return NextResponse.json({ data: move })
  } catch (err) {
    const status = err instanceof MoveError ? 400 : 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
