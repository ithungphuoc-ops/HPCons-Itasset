import { NextResponse } from 'next/server'
import { listAllDevices } from '@/lib/firestore/devices'
import { listActiveEmployees } from '@/lib/firestore/employees'
import { listAllTasks } from '@/lib/firestore/tasks'
import { listRecentMoves, deviceStock } from '@/lib/firestore/moves'
import { requireSession } from '@/lib/session'
import { stockLeft } from '@/lib/kho/config'
import { getKhoSettings } from '@/lib/firestore/settings'

// Ô số liệu Tổng quan Kho IT — TỰ ĐẾM từ dữ liệu (thiết kế cũ là số gõ tay 133/87/46…).
// Dùng lại các list đã cache 30s → mở Tổng quan gần như không tốn thêm lượt đọc.
export async function GET() {
  try {
    await requireSession()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  try {
    const [devices, employees, tasks, recent, settings] = await Promise.all([
      listAllDevices(),
      listActiveEmployees(),
      listAllTasks(),
      listRecentMoves(8),
      getKhoSettings(),
    ])
    const stats = {
      total: devices.length,
      in_use: devices.filter((d) => d.status === 'in_use').length,
      in_stock: devices.filter((d) => d.status === 'in_stock').length,
      broken: devices.filter((d) => d.status === 'broken').length,
      liquidated: devices.filter((d) => d.status === 'liquidated').length,
      employees: employees.length,
      tasks: tasks.filter((t) => !t.completed).length,
      tasks_total: tasks.length,
      units_left: devices.reduce((s, d) => s + Math.max(0, stockLeft(deviceStock(d))), 0),
      by_category: Object.fromEntries(settings.categories.map((c) => [c.key, devices.filter((d) => d.category === c.key).length])),
    }
    return NextResponse.json({ stats, recent })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
