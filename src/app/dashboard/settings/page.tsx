'use client'
import { useState, useEffect } from 'react'
import { Shield, Plus, Trash2, Users, Check, ExternalLink } from 'lucide-react'
import { reportActivity } from '@/lib/reportActivity'

type Tab = 'account' | 'users'
type Role = 'admin' | 'it_staff' | 'viewer'
interface AppUser { email: string; role: Role; name: string }

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', it_staff: 'IT Staff', viewer: 'Chỉ xem' }
const ROLE_OPTS: Role[] = ['viewer', 'it_staff', 'admin']

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('account')
  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cài đặt</h1>
        <p className="text-gray-400 text-sm mt-1">Tài khoản & phân quyền</p>
      </div>
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6 w-fit">
        {([['account', 'Tài khoản của tôi'], ['users', 'Phân quyền']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'account' ? <AccountTab /> : <UsersTab />}
    </div>
  )
}

function AccountTab() {
  const [me, setMe] = useState<{ email: string; name: string; role: string | null } | null>(null)
  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(setMe) }, [])
  const roleLabel = me?.role ? (ROLE_LABEL[me.role as Role] ?? me.role) : 'Nhân viên'
  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-400 font-bold text-lg">
            {(me?.name || me?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{me?.name || '—'}</p>
            <p className="text-sm text-gray-400">{me?.email || ''}</p>
          </div>
          <span className="ml-auto text-xs bg-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full">{roleLabel}</span>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4"><Shield size={16} className="text-blue-400" /><h2 className="font-semibold">Đăng nhập & bảo mật</h2></div>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="flex items-center justify-between py-2 border-b border-gray-800"><span>Phương thức</span><span className="text-green-400">Tài khoản chung HP Cons (SSO)</span></div>
          <div className="flex items-center justify-between py-2"><span>Đổi mật khẩu</span>
            <a href="https://account.hpcore.vn/dashboard/profile" target="_blank" rel="noopener noreferrer" className="text-blue-400 inline-flex items-center gap-1 hover:underline">
              Quản lý tại app tổng <ExternalLink size={12} />
            </a>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">Đăng nhập ITAsset dùng chung tài khoản với account.hpcore.vn. Mật khẩu do app tổng quản lý.</p>
      </div>
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<{ email: string; name: string; role: Role }>({ email: '', name: '', role: 'viewer' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    const json = await res.json()
    setUsers(json.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error || 'Lỗi'); return }
    reportActivity({ action: 'Cấp quyền dashboard', entityType: 'admin_user', entityId: form.email, detail: `Cấp vai trò "${form.role}" cho ${form.email}` })
    setForm({ email: '', name: '', role: 'viewer' })
    setSuccess('Đã cấp quyền!'); setTimeout(() => setSuccess(''), 3000)
    load()
  }

  async function changeRole(email: string, role: Role) {
    await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
    })
    reportActivity({ action: 'Đổi vai trò dashboard', entityType: 'admin_user', entityId: email, detail: `${email} -> ${role}` })
    load()
  }

  async function remove(email: string) {
    if (!confirm(`Gỡ quyền dashboard của ${email}? (trở lại nhân viên thường, chỉ xem thiết bị của mình)`)) return
    await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' })
    reportActivity({ action: 'Gỡ quyền dashboard', entityType: 'admin_user', entityId: email, detail: `Gỡ quyền dashboard của ${email}` })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-300/80">
        Đăng nhập dùng chung với app tổng. Ở đây chỉ cấp <b>vai trò dashboard</b> (Chỉ xem / IT Staff / Admin) theo email.
        Email chưa được cấp = nhân viên thường (chỉ xem thiết bị của mình ở /my-devices).
      </div>

      {/* Cấp quyền */}
      <form onSubmit={handleAssign} className="bg-gray-900 border border-gray-800 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Email *</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@hpcons.com.vn" required
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Họ tên (tuỳ chọn)</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nguyễn Văn A"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Vai trò</label>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
            {ROLE_OPTS.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={14} /> {saving ? '...' : 'Cấp quyền'}
        </button>
      </form>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-green-400 text-sm flex items-center gap-2"><Check size={14} />{success}</div>}

      {/* Danh sách */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <Users size={15} className="text-blue-400" />
          <span className="font-medium text-sm">Người có quyền dashboard</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{users.length}</span>
        </div>
        {loading ? (
          <div className="py-10 text-center text-gray-500 text-sm">Đang tải...</div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-gray-500 text-sm">Chưa cấp quyền dashboard cho ai</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {users.map(u => (
                <tr key={u.email} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{u.name || u.email}</div>
                    {u.name && <div className="text-xs text-gray-400">{u.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <select value={u.role} onChange={e => changeRole(u.email, e.target.value as Role)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500">
                      {ROLE_OPTS.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(u.email)} title="Gỡ quyền dashboard"
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
