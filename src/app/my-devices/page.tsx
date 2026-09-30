'use client'
import { useEffect, useState } from 'react'
import { Monitor, Laptop, Cpu, Package, LogOut, QrCode } from 'lucide-react'
import { UserAvatar } from '@/components/UserAvatar'

interface Device {
  id: string; brand: string; model: string; asset_code: string
  category: string; serial_number?: string; status: string
  assigned_date: string
}

const catIcon: Record<string, typeof Monitor> = {
  laptop: Laptop, monitor: Monitor, pc: Cpu,
}
function DeviceIcon({ cat }: { cat: string }) {
  const Icon = catIcon[cat] || Package
  return <Icon size={18} className="text-blue-400" />
}

const catLabel: Record<string, string> = {
  laptop: 'Laptop', monitor: 'Màn hình', pc: 'PC', printer: 'Máy in',
  networking: 'Thiết bị mạng', component: 'Linh kiện', ups: 'UPS',
  peripheral: 'Phụ kiện', other: 'Khác',
}

export default function MyDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [employeeCode, setEmployeeCode] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Đăng xuất chung → về trang đăng nhập app tổng
    window.location.href = 'https://account.hpcore.vn/login'
  }

  useEffect(() => {
    async function load() {
      const meRes = await fetch('/api/auth/me')
      const me = await meRes.json()
      if (!me.email) return
      setName(me.name || me.email || '')
      setAvatar(me.avatar || null)

      const res = await fetch(`/api/my-devices?email=${encodeURIComponent(me.email)}`)
      const json = await res.json()
      setDevices(json.devices || [])
      setEmployeeCode(json.employee_code || null)
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <a href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <Package className="text-blue-400" size={16} />
          </div>
          <div>
            <p className="font-semibold text-sm">Thiết bị của tôi</p>
            <p className="text-xs text-gray-400">Kho Tổng · HP CONS</p>
          </div>
        </a>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{name}</p>
            {employeeCode && (
              <a href={`/employee/${employeeCode}`} className="text-xs text-blue-400 hover:underline flex items-center gap-1 justify-end">
                <QrCode size={10} /> Trang QR công khai
              </a>
            )}
          </div>
          <UserAvatar avatar={avatar} name={name} size={32} />
          <button onClick={logout} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
            <LogOut size={14} /> Đăng xuất
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Thiết bị được cấp phát</h1>
        <p className="text-sm text-gray-400 mb-6">Danh sách thiết bị IT đang được cấp cho bạn</p>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Đang tải...</div>
        ) : devices.length === 0 ? (
          <div className="text-center py-16">
            <Package className="text-gray-700 mx-auto mb-3" size={40} />
            <p className="text-gray-400">Bạn chưa được cấp thiết bị nào</p>
            <p className="text-xs text-gray-600 mt-1">Liên hệ bộ phận IT nếu có thắc mắc</p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map(d => (
              <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
                  <DeviceIcon cat={d.category} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.brand} {d.model}</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{catLabel[d.category] || d.category}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span className="font-mono">{d.asset_code}</span>
                    {d.serial_number && <span>S/N: {d.serial_number}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">Nhận từ</p>
                  <p className="text-sm">{new Date(d.assigned_date).toLocaleDateString('vi-VN')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
