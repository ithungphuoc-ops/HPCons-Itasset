// Trạng thái hiển thị của Công việc — luôn TÍNH TỰ ĐỘNG từ (hạn xử lý, đã tick hoàn thành hay
// chưa), không cho chọn tay. Logic mang nguyên từ app "Trạm IT" (25/09/2026) — đã được duyệt.
export type TaskStatus = 'new' | 'overdue' | 'done' | 'done_late'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Mới',
  overdue: 'Quá hạn',
  done: 'Hoàn thành',
  done_late: 'Hoàn thành quá hạn',
}

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  overdue: 'bg-red-500/20 text-red-400',
  done: 'bg-green-500/20 text-green-400',
  done_late: 'bg-amber-500/20 text-amber-400',
}

export function computeTaskStatus(dueDate: string, completed: boolean, today: Date = new Date()): TaskStatus {
  const due = parseIsoDate(dueDate)
  const onTime = due >= startOfDay(today)
  if (completed) return onTime ? 'done' : 'done_late'
  return onTime ? 'new' : 'overdue'
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
