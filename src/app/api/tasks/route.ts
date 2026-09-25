import { NextRequest, NextResponse } from 'next/server'
import { listAllTasks } from '@/lib/firestore/tasks'
import { requireSession } from '@/lib/session'

export async function GET(_req: NextRequest) {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const tasks = await listAllTasks()
    return NextResponse.json({ data: tasks })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
