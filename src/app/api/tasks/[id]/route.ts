import { NextRequest, NextResponse } from 'next/server'
import { setTaskCompleted, deleteTask } from '@/lib/firestore/tasks'
import { requireWriteAccess } from '@/lib/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWriteAccess()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await req.json()
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
