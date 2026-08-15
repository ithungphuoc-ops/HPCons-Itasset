'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Search, CheckCircle, User } from 'lucide-react'
import Link from 'next/link'

/** Tô sáng phần chữ khớp với từ khoá tìm kiếm — plain-match, khớp đúng luật lọc `filtered` ở dưới. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const index = text.toLowerCase().indexOf(q.toLowerCase())
  if (index === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-green-500/20 px-0.5 font-semibold text-green-300">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  )
}

interface Device { id: string; brand: string; model: string; asset_code: string; status: string; quantity: number }
interface Employee { id: string; full_name: string; employee_code?: string; department?: { name: string } }

export default function AssignDevicePage() {
  const { id } = useParams()
  const router = useRouter()
  const [device, setDevice] = useState<Device | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Employee | null>(null)
  const [notes, setNotes] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [inStock, setInStock] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [devRes, empRes] = await Promise.all([
        fetch(`/api/devices/${id}`),
        fetch('/api/employees'),
      ])
      const devJson = await devRes.json()
      const empJson = await empRes.json()
      setDevice(devJson.data)
      setEmployees(empJson.data || [])
      // Tính tồn kho = quantity - số lượng đang cấp phát
      const qty = devJson.data?.quantity || 1
      const activeQty = devJson.active_assignment?.quantity || 0
      const stock = Math.max(0, qty - activeQty)
      setInStock(stock)
      setQuantity(Math.min(1, stock))
    }
    load()
  }, [id])

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_code?.toLowerCase().includes(search.toLowerCase()) ||
    (e.department as { name: string } | undefined)?.name?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAssign() {
    if (!selected) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: id, employee_id: selected.id, notes, quantity }),
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

  return (
    <div className="p-8 max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/dashboard/devices/${id}`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Cấp phát thiết bị</h1>
          {device && <p className="text-gray-400 text-sm mt-0.5">{device.brand} {device.model} · <span className="font-mono">{device.asset_code}</span></p>}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <h2 className="font-semibold mb-4">Chọn nhân viên nhận máy</h2>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" placeholder="Tìm tên, mã NV, phòng ban..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">Không tìm thấy nhân viên</p>
          ) : filtered.map(emp => (
            <button key={emp.id} type="button" onClick={() => setSelected(emp)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                selected?.id === emp.id
                  ? 'bg-blue-600/20 border border-blue-500/50'
                  : 'hover:bg-gray-800 border border-transparent'
              }`}>
              <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0 text-blue-400 text-xs font-medium">
                {emp.full_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate"><HighlightMatch text={emp.full_name} query={search} /></div>
                <div className="text-xs text-gray-500">
                  {(emp.department as { name: string } | undefined)?.name}
                  {emp.employee_code && ` · `}
                  {emp.employee_code && <HighlightMatch text={emp.employee_code} query={search} />}
                </div>
              </div>
              {selected?.id === emp.id && <CheckCircle size={15} className="text-blue-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* Người được chọn */}
      {selected && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <User size={15} className="text-blue-400 shrink-0" />
          <span className="text-sm text-blue-300">Cấp cho: <strong>{selected.full_name}</strong></span>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        {/* Số lượng — chỉ hiện nếu tồn kho > 1 */}
        {inStock > 1 && (
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1.5">
              Số lượng xuất
              <span className="text-gray-600 ml-2">(tồn kho: {inStock})</span>
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-9 h-9 bg-gray-800 border border-gray-700 rounded-lg text-lg font-bold hover:border-gray-500 transition-colors flex items-center justify-center">−</button>
              <span className="text-2xl font-bold w-10 text-center">{quantity}</span>
              <button type="button" onClick={() => setQuantity(q => Math.min(inStock, q + 1))}
                className="w-9 h-9 bg-gray-800 border border-gray-700 rounded-lg text-lg font-bold hover:border-gray-500 transition-colors flex items-center justify-center">+</button>
              <span className="text-sm text-gray-500">/ {inStock} cái</span>
            </div>
          </div>
        )}
        <label className="block text-sm text-gray-400 mb-1.5">Ghi chú (tuỳ chọn)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="VD: Cấp cho dự án XYZ, thay máy cũ..."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none" />
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}

      <div className="flex gap-3">
        <button onClick={handleAssign} disabled={!selected || loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
          <CheckCircle size={15} />
          {loading ? 'Đang cấp phát...' : selected ? `Cấp cho ${selected.full_name}` : 'Chọn nhân viên'}
        </button>
        <Link href={`/dashboard/devices/${id}`} className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white border border-gray-700 transition-colors">
          Hủy
        </Link>
      </div>
    </div>
  )
}
