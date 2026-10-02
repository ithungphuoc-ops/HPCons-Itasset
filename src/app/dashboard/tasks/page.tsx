'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Wrench, ShieldCheck, Download, LifeBuoy, MoreHorizontal, Pencil } from 'lucide-react'
import Link from 'next/link'
import type { Task, TaskType, TaskPriority } from '@/lib/types'
import { useRole } from '@/lib/hooks/useRole'
import { computeTaskStatus, TASK_STATUS_LABEL, TASK_STATUS_COLOR, type TaskStatus } from '@/lib/task-status'
import { useKhoSettings } from '@/lib/kho/useKhoSettings'

const TYPE_LABEL: Record<TaskType, string> = {
  repair: 'Sửa chữa', warranty: 'Bảo hành', install: 'Cài đặt', support: 'Hỗ trợ', other: 'Khác',
}
const TYPE_ICON: Record<TaskType, React.ElementType> = {
  repair: Wrench, warranty: ShieldCheck, install: Download, support: LifeBuoy, other: MoreHorizontal,
}
const PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: 'text-red-400', medium: 'text-amber-400', low: 'text-gray-400',
}

const STATUS_FILTERS: Array<TaskStatus | 'all'> = ['all', 'new', 'overdue', 'done', 'done_late']

export default function TasksPage() {
  const { canWrite, isAdmin } = useRole()
  // Người Công việc (Sửa giao diện) — ô lọc + nút ＋ giao việc lấy từ đây (Sếp duyệt demo 02/10/2026)
  const { settings: KS } = useKhoSettings()
  const [assignOpen, setAssignOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    const res = await fetch('/api/tasks')
    const json = await res.json()
    setTasks((json.data as Task[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const withStatus = useMemo(
    () => tasks.map((t) => ({ task: t, status: computeTaskStatus(t.dueDate, t.completed) })),
    [tasks],
  )

  // Tên cũ còn trong công việc nhưng không còn trong danh sách Người Công việc → vẫn lọc được, ghi "(cũ)"
  const oldNames = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.assigneeName).filter((v): v is string => !!v && !KS.taskPeople.includes(v)))),
    [tasks, KS.taskPeople],
  )

  const count = (s: TaskStatus | 'all') => (s === 'all' ? withStatus.length : withStatus.filter((x) => x.status === s).length)

  const rows = withStatus.filter(
    ({ task, status }) =>
      (statusFilter === 'all' || status === statusFilter) &&
      (!assigneeFilter || (assigneeFilter === '__none' ? !task.assigneeName : task.assigneeName === assigneeFilter)),
  )

  // Đóng hộp chọn người khi bấm ra ngoài
  useEffect(() => {
    if (!assignOpen) return
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-assign-box]')) setAssignOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [assignOpen])

  function flash(ok: boolean, text: string) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 2600) }

  // Nút ＋: giao Phụ trách cho việc "Chưa phân công" — giao xong khoá (máy chủ kiểm tra lại)
  async function assign(task: Task, name: string) {
    setAssignOpen(null)
    setPending(task.id)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigneeName: name }),
      })
      const json = await res.json()
      if (!res.ok) flash(false, json.error || 'Chưa giao được')
      else flash(true, `Đã giao "${task.title}" cho ${name}`)
      await fetchTasks()
    } finally {
      setPending(null)
    }
  }

  async function toggleCompleted(task: Task) {
    setPending(task.id)
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed }),
      })
      await fetchTasks()
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Công việc</h1>
          <p className="text-gray-400 text-sm mt-1">Yêu cầu sửa chữa, bảo hành, cài đặt và hỗ trợ IT.</p>
        </div>
        {canWrite && (
          <Link href="/dashboard/tasks/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Thêm công việc
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {s === 'all' ? 'Tất cả' : TASK_STATUS_LABEL[s]} · {count(s)}
            </button>
          ))}
        </div>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Người thực hiện: Tất cả</option>
          <option value="__none">Chưa phân công</option>
          {KS.taskPeople.map((a) => <option key={a} value={a}>{a}</option>)}
          {oldNames.map((a) => <option key={a} value={a}>{a} (cũ)</option>)}
        </select>
        {isAdmin && (
          <Link href="/dashboard/giao-dien?tab=people" className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
            <Pencil size={13} /> Sửa danh sách người
          </Link>
        )}
      </div>

      {msg && <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm shadow-xl border ${msg.ok ? 'bg-gray-800 border-green-600 text-green-400' : 'bg-gray-800 border-red-600 text-red-400'}`}>{msg.text}</div>}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">Tiêu đề</th>
              <th className="px-4 py-3 font-medium">Người yêu cầu</th>
              <th className="px-4 py-3 font-medium">Phụ trách</th>
              <th className="px-4 py-3 font-medium">Ưu tiên</th>
              <th className="px-4 py-3 font-medium">Hạn xử lý</th>
              <th className="px-4 py-3 font-medium text-center">Hoàn thành</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-500">Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-16 text-center text-gray-500">Chưa có công việc nào</td></tr>
            ) : rows.map(({ task, status }) => {
              const Icon = TYPE_ICON[task.type]
              return (
                <tr key={task.id} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-300">
                      <Icon size={14} />
                      {TYPE_LABEL[task.type]}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white">{task.title}</td>
                  <td className="px-4 py-3 text-gray-300">{task.requesterName}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {task.assigneeName ? task.assigneeName : (
                      <span className="relative inline-flex items-center gap-2" data-assign-box>
                        <span className="text-gray-500">— Chưa phân công —</span>
                        {canWrite && (
                          <button type="button" title="Phân công" disabled={pending === task.id}
                            onClick={() => setAssignOpen(assignOpen === task.id ? null : task.id)}
                            className="w-6 h-6 rounded-full border border-blue-500/60 bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white flex items-center justify-center disabled:opacity-40">
                            <Plus size={14} />
                          </button>
                        )}
                        {assignOpen === task.id && (
                          <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-1.5">
                            <div className="px-2 pt-1 pb-1.5 text-[11px] text-gray-400">Giao cho (giao xong không đổi được)</div>
                            {KS.taskPeople.length ? KS.taskPeople.map((p) => (
                              <button key={p} type="button" onClick={() => assign(task, p)}
                                className="block w-full text-left px-2.5 py-2 rounded-md text-sm text-white hover:bg-blue-600/30">{p}</button>
                            )) : (
                              <div className="px-2.5 py-2 text-xs text-gray-400">
                                Danh sách Người Công việc trống{isAdmin && <> — <Link href="/dashboard/giao-dien?tab=people" className="text-blue-400 underline">thêm người</Link></>}
                              </div>
                            )}
                          </div>
                        )}
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-xs font-semibold ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{new Date(task.dueDate).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      disabled={!canWrite || pending === task.id}
                      onChange={() => toggleCompleted(task)}
                      className="rounded border-gray-600 bg-gray-800 accent-green-500 cursor-pointer disabled:opacity-40"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${TASK_STATUS_COLOR[status]}`}>
                      {TASK_STATUS_LABEL[status]}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
