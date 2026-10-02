import { NextRequest, NextResponse } from 'next/server'
import { setTaskCompleted, deleteTask, assignTaskIfEmpty } from '@/lib/firestore/tasks'
import { getKhoSettings } from '@/lib/firestore/settings'
import { requireWriteAccess } from '@/lib/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
    // Giao Phụ trách (nút ＋) — chỉ khi công việc đang "Chưa phân công", người phải thuộc danh sách Người Công việc
    if (body.assigneeName !== undefined) {
      const name = typeof body.assigneeName === 'string' ? body.assigneeName.trim() : ''
      if (!name || !(await getKhoSettings()).taskPeople.includes(name)) {
        return NextResponse.json({ error: 'Người phụ trách không có trong danh sách Người Công việc' }, { status: 400 })
      }
      if (!(await assignTaskIfEmpty(id, name))) {
        return NextResponse.json({ error: 'Công việc này đã có người phụ trách — không đổi được' }, { status: 409 })
      }
      return NextResponse.json({ success: true })
    }
    if (typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'Thiếu trường completed' }, { status: 400 })
    }
    await setTaskCompleted(id, body.completed)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    await deleteTask(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
