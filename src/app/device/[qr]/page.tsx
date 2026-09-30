import { notFound } from 'next/navigation'
import { Laptop, Monitor, Cpu, Package, User, Calendar, CheckCircle, AlertTriangle, Printer } from 'lucide-react'
import { getDeviceById, findDeviceByQrCode, findDeviceByAssetCode, toDeviceJson } from '@/lib/firestore/devices'
import { listMovesForDevice } from '@/lib/firestore/moves'
import { computeHolders } from '@/lib/kho/holders'
import { SPEC_FIELDS, fmtDate } from '@/lib/kho/config'

const CATEGORY_LABEL: Record<string, string> = {
  laptop: 'Laptop', monitor: 'Màn hình', pc: 'PC / Máy tính để bàn',
  peripheral: 'Phụ kiện', printer: 'Máy in', other: 'Thiết bị khác',
}
const CATEGORY_ICON: Record<string, React.ElementType> = {
  laptop: Laptop, monitor: Monitor, pc: Cpu,
  peripheral: Package, printer: Printer, other: Package,
}

export default async function PublicDevicePage({ params }: { params: Promise<{ qr: string }> }) {
  const { qr } = await params

  // Thử lookup theo id → qr_code → asset_code
  const found = (await getDeviceById(qr)) ?? (await findDeviceByQrCode(qr)) ?? (await findDeviceByAssetCode(qr))
  if (!found) notFound()

  const device = toDeviceJson(found)
  // Người đang giữ — Kho Tổng (30/09/2026): tính từ phiếu Cấp phát / Thu hồi / Luân chuyển
  const holders = computeHolders(await listMovesForDevice(found.id)).filter((x) => x.qty > 0)

  const Icon = CATEGORY_ICON[device.category as string] || Package
  const statusColor = {
    in_use: 'text-green-400 bg-green-500/10 border-green-500/20',
    in_stock: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    broken: 'text-red-400 bg-red-500/10 border-red-500/20',
    liquidated: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  }[device.status as string] || 'text-gray-400'
  const statusLabel = { in_use: 'Đang sử dụng', in_stock: 'Trong kho', broken: 'Hỏng', liquidated: 'Thanh lý' }[device.status as string] || ''
  const warrantyExpired = device.warranty_expiry && new Date(device.warranty_expiry) < new Date()

  const specs = (device.specs || {}) as Record<string, string>
  const specFields = (SPEC_FIELDS[found.category] || Object.keys(specs)).filter((k) => specs[k])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Icon className="text-blue-400" size={28} />
          </div>
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{CATEGORY_LABEL[device.category as string] || device.category}</p>
          <h1 className="text-2xl font-bold">{device.brand} {device.model}</h1>
          <p className="text-gray-400 font-mono text-sm mt-1">{device.asset_code}</p>
          <span className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
            {device.status === 'in_use' ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            {statusLabel}
          </span>
        </div>

        {/* Người đang giữ */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">{holders.length ? 'Đang sử dụng bởi' : 'Người sử dụng'}</div>
          {holders.length ? (
            <div className="space-y-3">
              {holders.map((x) => (
                <div key={x.key} className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center shrink-0">
                    <User size={18} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white">{x.name}{x.qty > 1 ? <span className="text-gray-400 font-normal"> · {x.qty} cái</span> : null}</div>
                    {x.pb && <div className="text-sm text-gray-400">{x.pb}</div>}
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Calendar size={11} /> Nhận từ {fmtDate(x.since)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Thiết bị đang trong kho, chưa cấp phát</p>
          )}
        </div>

        {/* Thông tin chung */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Thông tin thiết bị</div>
          <div className="space-y-2.5">
            {device.serial_number && <Row label="Serial" value={device.serial_number} mono />}
            {device.purchase_date && <Row label="Ngày mua" value={new Date(device.purchase_date).toLocaleDateString('vi-VN')} />}
            {device.purchase_price && <Row label="Nguyên giá" value={Number(device.purchase_price).toLocaleString('vi-VN') + ' ₫'} />}
            {device.warranty_expiry && (
              <Row
                label="Bảo hành đến"
                value={new Date(device.warranty_expiry).toLocaleDateString('vi-VN')}
                valueClass={warrantyExpired ? 'text-red-400' : 'text-green-400'}
                suffix={warrantyExpired ? ' · Hết hạn' : ' · Còn hạn'}
              />
            )}
          </div>
        </div>

        {specFields.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Thông số kĩ thuật</div>
            <div className="space-y-2.5">
              {specFields.map((k) => <Row key={k} label={k} value={specs[k]} />)}
            </div>
          </div>
        )}

        {device.notes && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Ghi chú</div>
            <p className="text-sm text-gray-300">{device.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-6">Kho Tổng · HP CONS</p>
      </div>
    </div>
  )
}

function Row({ label, value, mono, valueClass, suffix }: {
  label: string; value: string; mono?: boolean; valueClass?: string; suffix?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className={`text-sm text-right ${mono ? 'font-mono text-xs' : ''} ${valueClass || 'text-white'}`}>
        {value}{suffix && <span className="text-xs text-gray-500">{suffix}</span>}
      </span>
    </div>
  )
}
