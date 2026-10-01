import { NextRequest, NextResponse } from 'next/server'
import { createTask } from '@/lib/firestore/tasks'
import { requireWriteAccess } from '@/lib/session'
import { getKhoSettings } from '@/lib/firestore/settings'

export async function POST(req: NextRequest) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const { type, title, requesterName, assigneeName, deviceId, priority, dueDate } = body

  if (!type || !title || !requesterName || !priority || !dueDate) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
  }

  // Đợt 3: Phụ trách chọn từ danh sách "Người Công việc" (Sửa giao diện)
  if (assigneeName && !(await getKhoSettings()).taskPeople.includes(String(assigneeName))) {
    return NextResponse.json({ error: 'Người phụ trách không có trong danh sách Người Công việc' }, { status: 400 })
  }

  try {
    const task = await createTask({
      type,
      title,
      requesterName,
      assigneeName: assigneeName || null,
      deviceId: deviceId || null,
      priority,
      dueDate,
    })
    return NextResponse.json({ data: task })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
