'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import DatePicker from '@/components/DatePicker'
import type { DeviceCategory } from '@/lib/types'

const CATEGORIES: { value: DeviceCategory; label: string }[] = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'monitor', label: 'Màn hình' },
  { value: 'pc', label: 'PC / Bộ PC' },
  { value: 'peripheral', label: 'Phụ kiện' },
  { value: 'other', label: 'Khác' },
]

export default function EditDevicePage() {
  const { id } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [category, setCategory] = useState<DeviceCategory>('laptop')
  const [form, setForm] = useState({
    asset_code: '', brand: '', model: '', serial_number: '',
    purchase_date: '', purchase_price: '', warranty_expiry: '', notes: '',
  })
  const [laptopSpecs, setLaptopSpecs] = useState({ cpu: '', ram: '', storage: '', display: '', os: '', gpu: '' })
  const [monitorSpecs, setMonitorSpecs] = useState({ screen_size: '', resolution: '', panel_type: '', refresh_rate: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/devices/${id}`)
      const json = await res.json()
      const d = json.data
      if (!d) { router.push('/dashboard/devices'); return }

      setCategory(d.category)
      setForm({
        asset_code: d.asset_code || '',
        brand: d.brand || '',
        model: d.model || '',
        serial_number: d.serial_number || '',
        purchase_date: d.purchase_date || '',
        purchase_price: d.purchase_price?.toString() || '',
        warranty_expiry: d.warranty_expiry || '',
        notes: d.notes || '',
      })
      if (d.laptop_specs) setLaptopSpecs({
        cpu: d.laptop_specs.cpu || '', ram: d.laptop_specs.ram || '',
        storage: d.laptop_specs.storage || '', display: d.laptop_specs.display || '',
        os: d.laptop_specs.os || '', gpu: d.laptop_specs.gpu || '',
      })
      if (d.monitor_specs) setMonitorSpecs({
        screen_size: d.monitor_specs.screen_size || '', resolution: d.monitor_specs.resolution || '',
        panel_type: d.monitor_specs.panel_type || '', refresh_rate: d.monitor_specs.refresh_rate || '',
      })
      setFetching(false)
    }
    load()
  }, [id, router])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        asset_code: form.asset_code,
        category,
        brand: form.brand,
        model: form.model,
        serial_number: form.serial_number || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price ? parseInt(form.purchase_price) : null,
        warranty_expiry: form.warranty_expiry || null,
        notes: form.notes || null,
      }
      if (category === 'laptop') body.laptop_specs = laptopSpecs
      if (category === 'monitor') body.monitor_specs = monitorSpecs

      const res = await fetch(`/api/devices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.push(`/dashboard/devices/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) return <div className="p-8 text-gray-400">Đang tải...</div>

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/dashboard/devices/${id}`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Chỉnh sửa thiết bị</h1>
          <p className="text-gray-400 text-sm mt-0.5">Cập nhật thông tin tài sản IT</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Loại thiết bị */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Loại thiết bị</h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  category === c.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thông tin cơ bản */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Thông tin cơ bản</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mã tài sản *" placeholder="VD: IT-LP-001" value={form.asset_code} onChange={v => set('asset_code', v)} required />
            <Field label="Hãng *" placeholder="VD: Dell, HP, Lenovo" value={form.brand} onChange={v => set('brand', v)} required />
            <Field label="Model *" placeholder="VD: Latitude 5520" value={form.model} onChange={v => set('model', v)} required className="col-span-2" />
            <Field label="Serial Number" placeholder="VD: ABC123XYZ" value={form.serial_number} onChange={v => set('serial_number', v)} />
            <Field label="Ngày mua" type="date" value={form.purchase_date} onChange={v => set('purchase_date', v)} />
            <Field label="Giá mua (VNĐ)" type="number" placeholder="VD: 25000000" value={form.purchase_price} onChange={v => set('purchase_price', v)} />
            <Field label="Bảo hành đến" type="date" value={form.warranty_expiry} onChange={v => set('warranty_expiry', v)} />
          </div>
          <div className="mt-4">
            <label className="block text-sm text-gray-400 mb-1.5">Ghi chú</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Ghi chú thêm..." rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        </div>

        {/* Cấu hình Laptop */}
        {category === 'laptop' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-semibold mb-4">Cấu hình Laptop</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CPU" placeholder="VD: Intel Core i5-1135G7" value={laptopSpecs.cpu} onChange={v => setLaptopSpecs(s => ({ ...s, cpu: v }))} />
              <Field label="RAM" placeholder="VD: 8GB DDR4" value={laptopSpecs.ram} onChange={v => setLaptopSpecs(s => ({ ...s, ram: v }))} />
              <Field label="Ổ cứng" placeholder="VD: 256GB SSD NVMe" value={laptopSpecs.storage} onChange={v => setLaptopSpecs(s => ({ ...s, storage: v }))} />
              <Field label="Màn hình" placeholder="VD: 14 inch FHD IPS" value={laptopSpecs.display} onChange={v => setLaptopSpecs(s => ({ ...s, display: v }))} />
              <Field label="Hệ điều hành" placeholder="VD: Windows 11 Pro" value={laptopSpecs.os} onChange={v => setLaptopSpecs(s => ({ ...s, os: v }))} />
              <Field label="GPU (nếu có)" placeholder="VD: NVIDIA MX450" value={laptopSpecs.gpu} onChange={v => setLaptopSpecs(s => ({ ...s, gpu: v }))} />
            </div>
          </div>
        )}

        {/* Thông số Màn hình */}
        {category === 'monitor' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-semibold mb-4">Thông số màn hình</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kích thước" placeholder='VD: 24"' value={monitorSpecs.screen_size} onChange={v => setMonitorSpecs(s => ({ ...s, screen_size: v }))} />
              <Field label="Độ phân giải" placeholder="VD: 1920x1080" value={monitorSpecs.resolution} onChange={v => setMonitorSpecs(s => ({ ...s, resolution: v }))} />
              <Field label="Loại tấm nền" placeholder="VD: IPS, VA, TN" value={monitorSpecs.panel_type} onChange={v => setMonitorSpecs(s => ({ ...s, panel_type: v }))} />
              <Field label="Tần số quét" placeholder="VD: 75Hz" value={monitorSpecs.refresh_rate} onChange={v => setMonitorSpecs(s => ({ ...s, refresh_rate: v }))} />
            </div>
          </div>
        )}

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Save size={16} />
            {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
          <Link href={`/dashboard/devices/${id}`}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors">
            Hủy
          </Link>
        </div>
      </form>
    </div>
  )
}

function Field({ label, placeholder, value, onChange, type = 'text', required, className }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void
  type?: string; required?: boolean; className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      {type === 'date' ? (
        <DatePicker value={value} onChange={onChange} />
      ) : (
        <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} required={required}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
      )}
    </div>
  )
}
