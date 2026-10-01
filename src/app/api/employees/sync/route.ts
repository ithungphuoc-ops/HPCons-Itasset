import { NextResponse } from 'next/server'
import { syncFromHpcore } from '@/lib/firestore/hpcoreSync'
import { requireAdmin } from '@/lib/session'

// "Đồng bộ ngay" danh sách Nhân viên từ App Tổng HPcore — chỉ Admin (Đợt 3, 01/10/2026)
export async function POST() {
  let session
  try {
    session = await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }
  try {
    return NextResponse.json({ data: await syncFromHpcore(session.email) })
  } catch (err) {
    return NextResponse.json({ error: 'Không đồng bộ được từ HPcore: ' + (err as Error).message }, { status: 502 })
  }
}
