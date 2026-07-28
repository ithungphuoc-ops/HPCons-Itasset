'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { reportActivity } from '@/lib/reportActivity'

export default function NewDepartmentPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      reportActivity({ action: 'Thêm phòng ban', entityType: 'department', entityId: name, detail: `Tạo phòng ban "${name}"` })
      router.push('/dashboard/employees/new')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-md">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/employees" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Thêm phòng ban</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <label className="block text-sm text-gray-400 mb-1.5">Tên phòng ban *</label>
          <input type="text" placeholder="VD: Phòng IT, Phòng Kế toán..." value={name}
            onChange={e => setName(e.target.value)} required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}
        <button type="submit" disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
          <Save size={16} />
          {loading ? 'Đang lưu...' : 'Lưu phòng ban'}
        </button>
      </form>
    </div>
  )
}
