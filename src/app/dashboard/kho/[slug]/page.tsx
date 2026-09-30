// Kho chưa làm (VPP / Thi công / Chơn Thành) — Sếp chốt làm Kho IT trước, các kho khác sau.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Construction } from 'lucide-react'
import { KHO_LIST } from '@/lib/kho/config'

export default async function KhoPlaceholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const kho = KHO_LIST.find((k) => k.slug === slug && !k.ready)
  if (!kho) notFound()
  return (
    <div className="p-6 lg:p-8 max-w-xl">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6"><ArrowLeft size={15} /> Kho Tổng</Link>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
        <Construction size={40} className="mx-auto mb-4" style={{ color: kho.color }} />
        <h1 className="text-xl font-bold mb-1">{kho.name}</h1>
        <p className="text-gray-400 text-sm">{kho.desc}</p>
        <p className="text-gray-500 text-sm mt-4">Kho này đang được xây dựng — làm sau Kho IT.</p>
      </div>
    </div>
  )
}
