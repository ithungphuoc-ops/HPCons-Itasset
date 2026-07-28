'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { reportActivity } from '@/lib/reportActivity'

export default function NewEmployeePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', employee_code: '', department_id: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(j => setDepartments(j.data || []))
  }, [])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          employee_code: form.employee_code || null,
          department_id: form.department_id || null,
          is_active: true,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      reportActivity({ action: 'Thêm nhân viên', entityType: 'employee', entityId: form.employee_code || form.full_name, detail: `Tạo nhân viên "${form.full_name}"` })
      router.push('/dashboard/employees')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/employees" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Thêm nhân viên</h1>
          <p className="text-gray-400 text-sm mt-0.5">Nhập thông tin nhân viên</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <Field label="Họ tên *" placeholder="Nguyễn Văn A" value={form.full_name} onChange={v => set('full_name', v)} required />
          <Field label="Mã nhân viên" placeholder="VD: NV001" value={form.employee_code} onChange={v => set('employee_code', v)} />
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Phòng ban</label>
            <select value={form.department_id} onChange={e => set('department_id', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">-- Chọn phòng ban --</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {departments.length === 0 && (
              <p className="text-xs text-yellow-400 mt-1.5">
                Chưa có phòng ban. <Link href="/dashboard/departments/new" className="underline">Tạo phòng ban trước</Link>
              </p>
            )}
          </div>
          <Field label="Email" type="email" placeholder="email@company.com" value={form.email} onChange={v => set('email', v)} />
          <Field label="Số điện thoại" placeholder="0901234567" value={form.phone} onChange={v => set('phone', v)} />
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Save size={16} />
            {loading ? 'Đang lưu...' : 'Lưu nhân viên'}
          </button>
          <Link href="/dashboard/employees" className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors">
            Hủy
          </Link>
        </div>
      </form>
    </div>
  )
}

function Field({ label, placeholder, value, onChange, type = 'text', required }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
    </div>
  )
}
