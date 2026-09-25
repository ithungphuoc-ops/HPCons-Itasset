'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import DatePicker from '@/components/DatePicker'
import { TASK_ASSIGNEES, type TaskType, type TaskPriority } from '@/lib/types'

const TYPES: { value: TaskType; label: string }[] = [
  { value: 'repair', label: 'Sửa chữa' },
  { value: 'warranty', label: 'Bảo hành' },
  { value: 'install', label: 'Cài đặt' },
  { value: 'support', label: 'Hỗ trợ' },
  { value: 'other', label: 'Khác' },
]
const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'high', label: 'Cao' },
]

interface DeviceOption { id: string; asset_code: string; brand: string; model: string }

export default function NewTaskPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [type, setType] = useState<TaskType>('repair')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [title, setTitle] = useState('')
  const [requesterName, setRequesterName] = useState('')
  const [assigneeName, setAssigneeName] = useState(TASK_ASSIGNEES[0])
  const [deviceId, setDeviceId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [devices, setDevices] = useState<DeviceOption[]>([])

  useEffect(() => {
    fetch('/api/devices').then((res) => res.json()).then((json) => setDevices(json.data || []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, priority, title, requesterName,
          assigneeName: assigneeName || null,
          deviceId: deviceId || null,
          dueDate,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.push('/dashboard/tasks')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/tasks" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Thêm công việc</h1>
          <p className="text-gray-400 text-sm mt-0.5">Yêu cầu sửa chữa, bảo hành, cài đặt hoặc hỗ trợ IT</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Loại công việc</h2>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button key={t.value} type="button" onClick={() => setType(t.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === t.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Thông tin công việc</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-gray-400 mb-1.5">Tiêu đề *</label>
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Máy in phòng Kinh doanh bị kẹt giấy"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Người yêu cầu *</label>
              <input type="text" required value={requesterName} onChange={(e) => setRequesterName(e.target.value)}
                placeholder="Họ tên nhân viên"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Phụ trách</label>
              <select value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
                {TASK_ASSIGNEES.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Mức ưu tiên</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Hạn xử lý *</label>
              <DatePicker value={dueDate} onChange={setDueDate} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-400 mb-1.5">Thiết bị liên quan</label>
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="">— Không có —</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.asset_code} — {d.brand} {d.model}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Save size={16} />
            {loading ? 'Đang lưu...' : 'Lưu công việc'}
          </button>
          <Link href="/dashboard/tasks" className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors">
            Hủy
          </Link>
        </div>
      </form>
    </div>
  )
}
