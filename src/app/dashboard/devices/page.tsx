'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Plus, Upload, Monitor, Laptop, Cpu, Package, Printer, Wifi, Zap, QrCode, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { DeviceStatus, DeviceCategory } from '@/lib/types'
import { useRole } from '@/lib/hooks/useRole'

function normalizeVi(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D').toLowerCase()
}

interface Device {
  id: string; asset_code: string; category: DeviceCategory; brand: string; model: string
  serial_number?: string; status: DeviceStatus; warranty_expiry?: string
  quantity: number; quantity_in_use: number; quantity_in_stock: number
  assignees?: { id: string; full_name: string }[]
  // Đã có sẵn ở API (toDeviceJson) nhưng trang danh sách trước đây chưa khai báo/hiển thị —
  // bổ sung 25/09/2026 để thấy ảnh thiết bị ngay trong bảng, giống phong cách demo "Trạm IT".
  image_url?: string | null
}

const STATUS_LABEL: Record<DeviceStatus, string> = {
  in_use: 'Đang dùng', in_stock: 'Trong kho', broken: 'Hỏng', liquidated: 'Thanh lý',
}
const STATUS_COLOR: Record<DeviceStatus, string> = {
  in_use: 'bg-green-500/20 text-green-400',
  in_stock: 'bg-blue-500/20 text-blue-400',
  broken: 'bg-red-500/20 text-red-400',
  liquidated: 'bg-gray-500/20 text-gray-400',
}
const CATEGORY_LABEL: Record<DeviceCategory, string> = {
  laptop: 'Laptop', monitor: 'Màn hình', pc: 'PC', peripheral: 'Phụ kiện',
  printer: 'Máy in', networking: 'Thiết bị mạng', component: 'Linh kiện', ups: 'UPS', other: 'Khác',
}
const CATEGORY_ICON: Record<DeviceCategory, React.ElementType> = {
  laptop: Laptop, monitor: Monitor, pc: Cpu, peripheral: Package,
  printer: Printer, networking: Wifi, component: Cpu, ups: Zap, other: Package,
}

export default function DevicesPage() {
  const { canWrite } = useRole()
  const router = useRouter()
  const [allDevices, setAllDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<DeviceCategory | ''>('')
  const [filterStatus, setFilterStatus] = useState<DeviceStatus | ''>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    setSelected(prev => prev.size === devices.length ? new Set() : new Set(devices.map(d => d.id)))
  }
  async function handleExport() {
    setExporting(true)
    const res = await fetch('/api/devices/export')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `ThietBi_ITAsset_${new Date().toISOString().split('T')[0]}.xlsx`
    a.click(); URL.revokeObjectURL(url)
    setExporting(false)
  }
  function handlePrintQR() {
    const ids = Array.from(selected).join(',')
    router.push(`/dashboard/devices/print-qr?ids=${ids}`)
  }

  const fetchDevices = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterCategory) params.set('category', filterCategory)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/devices?${params.toString()}`)
    const json = await res.json()
    setAllDevices((json.data as Device[]) || [])
    setLoading(false)
  }, [filterCategory, filterStatus])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  // Text search client-side — hỗ trợ không dấu
  const devices = useMemo(() => {
    if (!search.trim()) return allDevices
    const q = normalizeVi(search)
    return allDevices.filter(d =>
      normalizeVi(d.asset_code).includes(q) ||
      normalizeVi(d.brand).includes(q) ||
      normalizeVi(d.model).includes(q) ||
      normalizeVi(d.serial_number || '').includes(q)
    )
  }, [allDevices, search])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Thiết bị</h1>
          <p className="text-gray-400 text-sm mt-1">{loading ? '...' : `${devices.length} thiết bị`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-2 border border-gray-700 hover:border-gray-500 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-colors disabled:opacity-50">
            <FileSpreadsheet size={16} />
            {exporting ? 'Đang xuất...' : 'Export Excel'}
          </button>
          {canWrite && (
            <>
              <Link href="/dashboard/devices/import" className="flex items-center gap-2 border border-gray-700 hover:border-gray-500 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-colors">
                <Upload size={16} /> Import
              </Link>
              <Link href="/dashboard/devices/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                <Plus size={16} /> Thêm thiết bị
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm mã, serial, hãng, model..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as DeviceCategory | '')}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
          <option value="">Tất cả loại</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as DeviceStatus | '')}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500">
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Action bar khi có chọn */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-blue-600/10 border border-blue-500/30 rounded-xl">
          <span className="text-sm text-blue-300 flex-1">Đã chọn <strong>{selected.size}</strong> thiết bị</span>
          <button onClick={handlePrintQR}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <QrCode size={15} /> In QR ({selected.size})
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 px-3 py-2 rounded-lg transition-colors">
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-left">
              <th className="px-4 py-3 w-10">
                <input type="checkbox"
                  checked={devices.length > 0 && selected.size === devices.length}
                  onChange={toggleAll}
                  className="rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer" />
              </th>
              <th className="px-4 py-3 font-medium">Mã tài sản</th>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">Hãng / Model</th>
              <th className="px-4 py-3 font-medium">Serial</th>
              <th className="px-4 py-3 font-medium">Cấp cho</th>
              <th className="px-4 py-3 font-medium text-right">Tổng số</th>
              <th className="px-4 py-3 font-medium text-right">Đang cấp</th>
              <th className="px-4 py-3 font-medium text-right">Tồn kho</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Bảo hành</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="px-4 py-16 text-center text-gray-500">Đang tải...</td></tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center text-gray-500">
                  <Package size={32} className="mx-auto mb-3 opacity-30" />
                  <p>Chưa có thiết bị nào</p>
                  <Link href="/dashboard/devices/new" className="inline-block mt-3 text-blue-400 hover:text-blue-300 text-sm">
                    + Thêm thiết bị đầu tiên
                  </Link>
                </td>
              </tr>
            ) : devices.map(device => {
              const Icon = CATEGORY_ICON[device.category]
              const isWarrantyExpired = device.warranty_expiry && new Date(device.warranty_expiry) < new Date()
              return (
                <tr key={device.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer ${selected.has(device.id) ? 'bg-blue-600/5' : ''}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return
                    window.location.href = `/dashboard/devices/${device.id}`
                  }}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(device.id)}
                      onChange={() => toggleSelect(device.id)}
                      className="rounded border-gray-600 bg-gray-800 accent-blue-500 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 font-mono text-blue-400 text-sm">{device.asset_code}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-gray-300">
                      <Icon size={14} />
                      {CATEGORY_LABEL[device.category]}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {device.image_url ? (
                        <Image
                          src={device.image_url}
                          alt=""
                          width={28}
                          height={28}
                          unoptimized
                          className="h-7 w-7 flex-none rounded-md border border-gray-700 object-cover"
                        />
                      ) : null}
                      <div>
                        <div className="font-medium text-white">{device.brand}</div>
                        <div className="text-gray-400 text-xs">{device.model}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{device.serial_number || '—'}</td>
                  <td className="px-4 py-3">
                    {device.assignees && device.assignees.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {device.assignees.map(a => (
                          <span key={a.id} className="text-xs text-white">{a.full_name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                  {/* 3 cột Tổng số/Đang cấp/Tồn kho tách riêng — giống bảng demo "Trạm IT" sáng
                      25/09/2026, thay cho ô gộp + thanh progress trước đây. */}
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{device.quantity || 1}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{device.quantity_in_use ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-white">{device.quantity_in_stock ?? (device.quantity || 1)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${STATUS_COLOR[device.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {STATUS_LABEL[device.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {device.warranty_expiry ? (
                      <span className={isWarrantyExpired ? 'text-red-400' : 'text-gray-400'}>
                        {new Date(device.warranty_expiry).toLocaleDateString('vi-VN')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/devices/${device.id}`} className="text-gray-400 hover:text-white text-xs transition-colors">
                      Chi tiết →
                    </Link>
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
