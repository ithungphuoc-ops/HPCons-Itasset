'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Phone, Building2, Laptop, Monitor, Cpu, Package, Calendar, Pencil, Trash2, Save, X, QrCode, ExternalLink, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRole } from '@/lib/hooks/useRole'
import { reportActivity } from '@/lib/reportActivity'
import { useKhoSettings } from '@/lib/kho/useKhoSettings'
import { catLabel } from '@/lib/kho/settings'


interface Employee {
  id: string; full_name: string; employee_code?: string
  email?: string; phone?: string; is_active: boolean
  department_id?: string
  department?: { id: string; name: string }
}
interface Assignment {
  id: string; assigned_date: string; is_active: boolean
  device: { id: string; asset_code: string; brand: string; model: string; category: string; status: string }
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  laptop: Laptop, monitor: Monitor, pc: Cpu, peripheral: Package, other: Package,
}

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [form, setForm] = useState({ full_name: '', employee_code: '', email: '', phone: '', department_id: '' })
  const [error, setError] = useState('')
  const { canWrite } = useRole()
  const { settings: KS } = useKhoSettings()

  useEffect(() => {
    async function load() {
      const [empRes, deptRes] = await Promise.all([
        fetch(`/api/employees/${id}`),
        fetch('/api/departments'),
      ])
      const empJson = await empRes.json()
      const deptJson = await deptRes.json()
      if (!empJson.data) { router.push('/dashboard/employees'); return }
      setEmployee(empJson.data)
      setAssignments(empJson.assignments || [])
      setDepartments(deptJson.data || [])
      setForm({
        full_name: empJson.data.full_name || '',
        employee_code: empJson.data.employee_code || '',
        email: empJson.data.email || '',
        phone: empJson.data.phone || '',
        department_id: empJson.data.department_id || '',
      })
      setLoading(false)
    }
    load()
  }, [id, router])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          employee_code: form.employee_code || null,
          email: form.email || null,
          phone: form.phone || null,
          department_id: form.department_id || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      reportActivity({ action: 'Sửa nhân viên', entityType: 'employee', entityId: String(id), detail: `Cập nhật hồ sơ "${form.full_name}"` })
      setEmployee(json.data)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi lưu dữ liệu')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await fetch(`/api/employees/${id}`, { method: 'DELETE' })
      reportActivity({ action: 'Xoá nhân viên', entityType: 'employee', entityId: String(id), detail: `Xoá nhân viên "${employee?.full_name ?? id}"` })
      router.push('/dashboard/employees')
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Đang tải...</div>
  if (!employee) return null

  const activeAssignments = assignments.filter(a => a.is_active)
  const historyAssignments = assignments.filter(a => !a.is_active)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/employees" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Chi tiết nhân viên</h1>
        <div className="ml-auto flex gap-2">
          {!editing && canWrite && (
            <>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 border border-gray-700 hover:border-blue-500 hover:text-blue-400 px-4 py-2 rounded-lg text-sm transition-colors">
                <Pencil size={14} /> Chỉnh sửa
              </button>
              <button onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 border border-gray-700 hover:border-red-500 hover:text-red-400 px-4 py-2 rounded-lg text-sm transition-colors">
                <Trash2 size={14} /> Xóa
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirm xóa */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-center mb-1">Xóa nhân viên?</h3>
            <p className="text-sm text-gray-400 text-center mb-5">
              <span className="text-white font-medium">{employee.full_name}</span> sẽ bị ẩn khỏi danh sách. Dữ liệu lịch sử vẫn được giữ lại.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 border border-gray-700 hover:border-gray-500 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                Hủy
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thông tin nhân viên */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Họ tên *" value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} />
              <Field label="Mã nhân viên" value={form.employee_code} onChange={v => setForm(f => ({ ...f, employee_code: v }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Phòng ban</label>
              <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="">-- Chưa phân công --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
              <Field label="Số điện thoại" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button onClick={() => { setEditing(false); setError('') }}
                className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-500 px-5 py-2 rounded-lg text-sm transition-colors">
                <X size={14} /> Hủy
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-blue-600/20 rounded-full flex items-center justify-center shrink-0 text-blue-400 text-xl font-bold">
              {employee.full_name.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{employee.full_name}</h2>
              {employee.employee_code && <p className="text-gray-400 font-mono text-sm mt-0.5">{employee.employee_code}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-gray-400">
                {employee.department && (
                  <span className="flex items-center gap-1.5"><Building2 size={13} className="text-gray-500" />{employee.department.name}</span>
                )}
                {employee.email && (
                  <span className="flex items-center gap-1.5"><Mail size={13} className="text-gray-500" />{employee.email}</span>
                )}
                {employee.phone && (
                  <span className="flex items-center gap-1.5"><Phone size={13} className="text-gray-500" />{employee.phone}</span>
                )}
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 shrink-0">
              Đang làm việc
            </span>
          </div>
        )}
      </div>

      {/* QR Code */}
      {employee.employee_code && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold mb-1 flex items-center gap-2">
                <QrCode size={15} className="text-blue-400" /> QR Code nhân viên
              </h3>
              <p className="text-xs text-gray-400 mb-3">Quét để xem toàn bộ thiết bị được cấp</p>
              <Link href={`/employee/${employee.employee_code}`} target="_blank"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                <ExternalLink size={11} /> Mở trang công khai
              </Link>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?text=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'https://it-asset-pi.vercel.app'}/employee/${employee.employee_code}`)}`}
              alt="QR Code"
              className="w-28 h-28 bg-white rounded-lg p-1.5"
            />
          </div>
        </div>
      )}

      {/* Modal gán thiết bị */}
      {/* Thiết bị đang dùng */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            Thiết bị đang sử dụng
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{activeAssignments.length}</span>
          </h3>
          {/* Kho Tổng (30/09/2026): cấp phát bằng phiếu ở trang Thiết bị (có in phiếu ký nhận) */}
          {canWrite && (
            <Link href="/dashboard/devices"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
              <Plus size={13} /> Cấp phát ở trang Thiết bị
            </Link>
          )}
        </div>
        {activeAssignments.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
            Chưa được cấp phát thiết bị nào
          </div>
        ) : (
          <div className="space-y-2">
            {activeAssignments.map(a => {
              const Icon = CATEGORY_ICON[a.device.category] || Package
              return (
                <Link key={a.id} href={`/dashboard/devices/${a.device.id}`}
                  className="flex items-center gap-4 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors group">
                  <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm group-hover:text-blue-400 transition-colors">{a.device.brand} {a.device.model}</div>
                    <div className="text-xs text-gray-500">{catLabel(KS, a.device.category)} · {a.device.asset_code}</div>
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
                    <Calendar size={11} />
                    {new Date(a.assigned_date).toLocaleDateString('vi-VN')}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Lịch sử */}
      {historyAssignments.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-400">
            Lịch sử thiết bị
            <span className="text-xs bg-gray-500/20 text-gray-500 px-2 py-0.5 rounded-full">{historyAssignments.length}</span>
          </h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {historyAssignments.map((a, i) => {
              const Icon = CATEGORY_ICON[a.device.category] || Package
              return (
                <div key={a.id} className={`flex items-center gap-3 px-4 py-3 opacity-50 ${i < historyAssignments.length - 1 ? 'border-b border-gray-800' : ''}`}>
                  <Icon size={14} className="text-gray-500 shrink-0" />
                  <div className="flex-1 text-sm text-gray-400">{a.device.brand} {a.device.model}</div>
                  <div className="text-xs text-gray-500 font-mono">{a.device.asset_code}</div>
                  <div className="text-xs text-gray-500">{new Date(a.assigned_date).toLocaleDateString('vi-VN')}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
    </div>
  )
}
