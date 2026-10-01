import { notFound } from 'next/navigation'
import { User, Monitor, Laptop, Cpu, Package, Building2, Printer } from 'lucide-react'
import Link from 'next/link'
import { getEmployeeById, findEmployeeByEmployeeCode, toEmployeeJson } from '@/lib/firestore/employees'
import { personHoldings } from '@/lib/firestore/moves'
import { toDeviceJson } from '@/lib/firestore/devices'
import { getKhoSettings } from '@/lib/firestore/settings'
import { catLabel } from '@/lib/kho/settings'

const CATEGORY_ICON: Record<string, React.ElementType> = {
  laptop: Laptop, monitor: Monitor, pc: Cpu,
  peripheral: Package, printer: Printer, other: Package,
}

export default async function EmployeePublicPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  // Tìm nhân viên theo employee_code hoặc id
  const found = (await findEmployeeByEmployeeCode(code)) ?? (await getEmployeeById(code))
  if (!found) notFound()
  const employee = await toEmployeeJson(found)

  // Thiết bị đang giữ — Kho Tổng (30/09/2026): tính từ phiếu Cấp phát / Thu hồi / Luân chuyển
  const { holdings } = await personHoldings(found.fullName)

  type DeviceRow = {
    id: string; asset_code: string; qr_code: string; category: string
    brand: string; model: string; serial_number: string; status: string; notes: string
    laptop_specs: Record<string, string> | null
    monitor_specs: Record<string, string> | null
    assigned_date: string; quantity: number; assignment_id: string
  }
  const devices: DeviceRow[] = holdings
    .sort((a, b) => b.since.localeCompare(a.since))
    .map((h) => ({
      ...(toDeviceJson(h.device) as unknown as Omit<DeviceRow, 'assigned_date' | 'quantity' | 'assignment_id'>),
      assigned_date: h.since,
      quantity: h.qty,
      assignment_id: h.device.id,
    }))

  // Group theo category
  const grouped: Record<string, DeviceRow[]> = {}
  for (const d of devices) {
    const cat = d.category
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(d)
  }

  const settings = await getKhoSettings()
  const dept = employee.department as { name: string } | null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-10">

        {/* Header nhân viên */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <User size={32} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold">{employee.full_name}</h1>
          <p className="text-gray-400 font-mono text-sm mt-1">{employee.employee_code}</p>
          {dept && (
            <div className="flex items-center justify-center gap-1.5 mt-2 text-sm text-gray-400">
              <Building2 size={13} />
              {dept.name}
            </div>
          )}
          {employee.email && (
            <p className="text-xs text-gray-500 mt-1">{employee.email}</p>
          )}
          {/* QR của chính trang này */}
          <div className="mt-3 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?text=${encodeURIComponent(`https://it-asset-pi.vercel.app/employee/${employee.employee_code}`)}`}
              alt="QR"
              className="w-20 h-20 bg-white rounded-lg p-1 mx-auto opacity-80"
            />
            <p className="text-xs text-gray-600 mt-1">{employee.employee_code}</p>
          </div>
        </div>

        {/* Tổng số thiết bị */}
        <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl px-5 py-4 mb-6 text-center">
          <p className="text-3xl font-bold text-blue-400">{devices.length}</p>
          <p className="text-sm text-gray-400 mt-1">thiết bị đang được cấp phát</p>
        </div>

        {/* Danh sách thiết bị theo nhóm */}
        {devices.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có thiết bị nào được cấp</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Thứ tự + tên Loại theo Sửa giao diện; Loại lạ (nếu có) xếp cuối, không bị ẩn */}
            {[...new Set([...settings.categories.map((c) => c.key), ...Object.keys(grouped)])].filter(cat => grouped[cat]).map(cat => {
              const Icon = CATEGORY_ICON[cat] || Package
              const items = grouped[cat]
              return (
                <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 border-b border-gray-800">
                    <Icon size={15} className="text-blue-400" />
                    <span className="text-sm font-semibold text-gray-200">{catLabel(settings, cat)}</span>
                    <span className="ml-auto text-xs text-gray-500 bg-gray-700/60 px-2 py-0.5 rounded-full">
                      {items.length} cái
                    </span>
                  </div>

                  {/* Devices */}
                  <div className="divide-y divide-gray-800/50">
                    {items.map((d, idx) => {
                      const laptopSpecs = d.laptop_specs
                      const monitorSpecs = d.monitor_specs
                      return (
                        <Link
                          key={idx}
                          href={`/device/${d.qr_code}`}
                          className="block px-4 py-4 hover:bg-gray-800/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white">
                                {d.brand} <span className="text-gray-300">{d.model}</span>
                              </p>
                              <p className="text-xs text-gray-500 font-mono mt-0.5">{d.asset_code}</p>

                              {/* PC Specs */}
                              {cat === 'pc' && laptopSpecs && (
                                <div className="mt-2 space-y-1">
                                  {laptopSpecs.cpu && <SpecRow icon="🖥" label="CPU" value={laptopSpecs.cpu} />}
                                  {laptopSpecs.ram && <SpecRow icon="💾" label="RAM" value={laptopSpecs.ram} />}
                                  {laptopSpecs.gpu && <SpecRow icon="🎮" label="GPU" value={laptopSpecs.gpu} />}
                                  {laptopSpecs.storage && <SpecRow icon="💿" label="Ổ cứng" value={laptopSpecs.storage} />}
                                  {laptopSpecs.main_board && <SpecRow icon="🔧" label="Main" value={laptopSpecs.main_board} />}
                                  {laptopSpecs.power_supply && <SpecRow icon="⚡" label="Nguồn" value={laptopSpecs.power_supply} />}
                                </div>
                              )}

                              {/* Laptop Specs */}
                              {cat === 'laptop' && laptopSpecs && (
                                <div className="mt-2 space-y-1">
                                  {laptopSpecs.cpu && <SpecRow icon="🖥" label="CPU" value={laptopSpecs.cpu} />}
                                  {laptopSpecs.ram && <SpecRow icon="💾" label="RAM" value={laptopSpecs.ram} />}
                                  {laptopSpecs.storage && <SpecRow icon="💿" label="Ổ cứng" value={laptopSpecs.storage} />}
                                  {laptopSpecs.display && <SpecRow icon="📺" label="Màn hình" value={laptopSpecs.display} />}
                                  {laptopSpecs.os && <SpecRow icon="🪟" label="OS" value={laptopSpecs.os} />}
                                </div>
                              )}

                              {/* Monitor Specs */}
                              {cat === 'monitor' && monitorSpecs && (
                                <div className="mt-2 space-y-1">
                                  {monitorSpecs.screen_size && <SpecRow icon="📐" label="Kích thước" value={monitorSpecs.screen_size} />}
                                  {monitorSpecs.resolution && <SpecRow icon="🔍" label="Độ phân giải" value={monitorSpecs.resolution} />}
                                  {monitorSpecs.panel_type && <SpecRow icon="🎨" label="Tấm nền" value={monitorSpecs.panel_type} />}
                                  {monitorSpecs.refresh_rate && <SpecRow icon="⚡" label="Tần số quét" value={monitorSpecs.refresh_rate} />}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-blue-400 shrink-0 mt-0.5">Chi tiết →</div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-8">Kho Tổng · HP CONS</p>
      </div>
    </div>
  )
}

function SpecRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-gray-500 w-16 shrink-0">{label}</span>
      <span className="text-gray-300 font-medium">{value}</span>
    </div>
  )
}
