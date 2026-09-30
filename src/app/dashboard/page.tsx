// Trang chủ Kho Tổng (30/09/2026): từ HPcore bấm vào là tới thẳng đây — hiện danh sách kho,
// chọn kho nào thì vào dashboard của kho đó. Làm Kho IT trước, các kho khác sau.
import Link from 'next/link'
import { ArrowRight, Warehouse } from 'lucide-react'
import { APP_NAME, KHO_LIST } from '@/lib/kho/config'

export default function KhoTongPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        <p className="text-gray-400 text-sm mt-1">Chọn kho để vào dashboard của kho đó</p>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {KHO_LIST.map((k) => (
          <Link key={k.slug} href={k.href}
            className="group bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-2xl p-6 transition-colors">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: k.color + '26' }}>
              <Warehouse size={24} style={{ color: k.color }} />
            </div>
            <div className="text-lg font-semibold mb-1">{k.name}</div>
            <div className="text-sm text-gray-400 min-h-[20px]">{k.desc}</div>
            <div className="mt-4 flex items-center gap-1.5 text-sm">
              {k.ready
                ? <span className="text-blue-400 group-hover:text-blue-300 flex items-center gap-1">Vào kho <ArrowRight size={14} /></span>
                : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">Đang xây dựng</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
