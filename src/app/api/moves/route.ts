import { NextRequest, NextResponse } from 'next/server'
import { createMove, listMovesForDevice, listPendingSign, listRecentMoves, personHoldings, MoveError, type CreateMoveInput } from '@/lib/firestore/moves'
import { getKhoSettings } from '@/lib/firestore/settings'
import { createTask } from '@/lib/firestore/tasks'
import { requireSession, requireWriteAccess } from '@/lib/session'

// GET /api/moves?deviceId=… → lịch sử phiếu của 1 thiết bị; ?recent=10 → phiếu mới nhất;
// ?holder=Tên → thiết bị người đó đang giữ (phiếu Thu hồi / Luân chuyển gợi ý sẵn — 10/10/2026);
// ?pending=1 → phiếu "Chờ ký" (phải in ký, chưa tải ảnh phiếu đã ký — 22/10/2026)
export async function GET(req: NextRequest) {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    const deviceId = req.nextUrl.searchParams.get('deviceId')
    const holder = (req.nextUrl.searchParams.get('holder') || '').trim().slice(0, 120)
    const recent = Number(req.nextUrl.searchParams.get('recent') || 0)
    if (deviceId) return NextResponse.json({ data: await listMovesForDevice(deviceId) })
    if (req.nextUrl.searchParams.get('pending')) {
      // Admin tắt "phải ký" cho 1 loại phiếu thì phiếu loại đó không còn bị nhắc
      const sign = (await getKhoSettings()).photo.sign
      return NextResponse.json({ data: (await listPendingSign()).filter((m) => sign[m.type]) })
    }
    if (holder) {
      const { holdings } = await personHoldings(holder)
      return NextResponse.json({ data: holdings.map((h) => ({ deviceId: h.device.id, assetCode: h.device.assetCode, qty: h.qty })) })
    }
    return NextResponse.json({ data: await listRecentMoves(Math.min(Math.max(recent, 1), 50)) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

type Body = CreateMoveInput & { repairTasks?: unknown }

// POST /api/moves — lập phiếu (Nhập kho / Cấp phát / Thu hồi / Luân chuyển)
export async function POST(req: NextRequest) {
  let session
  try {
    session = await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    const body = (await req.json().catch(() => null)) as Body | null
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
        photos: body.photos,
        lines: body.lines.map((l) => (l && typeof l === 'object'
          ? {
              deviceId: String(l.deviceId || ''),
              newDevice: l.newDevice && typeof l.newDevice === 'object' ? l.newDevice : null,
              fillSpecs: l.fillSpecs && typeof l.fillSpecs === 'object' ? l.fillSpecs : null,
              qty: Number(l.qty), condition: String(l.condition || ''), note: l.note == null ? null : String(l.note),
            }
          : (null as unknown as CreateMoveInput['lines'][number]))),
      },
      session.email,
    )

    // Thu hồi tình trạng "Hư" có tick "Tạo Công việc Sửa chữa" → tạo việc gắn đúng thiết bị, chờ phân
    // công. Việc phụ: lỗi ở đây không làm hỏng phiếu đã lưu (báo lại số việc tạo được).
    let repairCreated = 0
    if (move.type === 'TH' && Array.isArray(body.repairTasks)) {
      const want = new Set(body.repairTasks.filter((x): x is string => typeof x === 'string'))
      // Hạn = hôm nay theo giờ Việt Nam (máy chủ chạy giờ UTC) + 3 ngày
      const due = new Date(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00Z'); due.setUTCDate(due.getUTCDate() + 3)
      for (const l of move.lines) {
        if (!want.has(l.deviceId) || l.condition !== 'Hư') continue
        want.delete(l.deviceId)
        try {
          await createTask({
            type: 'repair',
            title: `Sửa chữa ${l.assetCode} — thu hồi từ ${move.info.nguoi || ''} (phiếu ${move.so}), tình trạng Hư`,
            requesterName: move.info.nguoi || session.email,
            assigneeName: null,
            deviceId: l.deviceId,
            priority: 'high',
            dueDate: due.toISOString().slice(0, 10),
          })
          repairCreated++
        } catch (e) {
          console.error('[moves] tạo công việc sửa chữa lỗi:', e)
        }
      }
    }
    return NextResponse.json({ data: move, repairCreated })
  } catch (err) {
    const status = err instanceof MoveError ? 400 : 500
    return NextResponse.json({ error: (err as Error).message }, { status })
  }
}
