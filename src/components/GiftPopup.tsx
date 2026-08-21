'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, RotateCw, ExternalLink, Home, type LucideIcon } from 'lucide-react'

const NHIEM_VU_URL = 'https://quacuatoi.hpcore.vn/nhiem-vu'

// Popup "Quà của tôi" dạng khung điện thoại nhúng iframe — thiết kế theo chuẩn
// đã hoàn thiện ở hpcons-portal (GiftPopup.tsx), thích ứng lại cho ITAsset:
// - Bezel/toolbar bên NGOÀI iframe dùng tông xanh dương + nền tối (khớp theme
//   bg-gray-950 của app này), khác hẳn nền trắng mặc định của bản gốc portal.
// - Bên TRONG khung điện thoại (chrome quanh iframe + chính iframe) vẫn giữ
//   nền trắng như tham chiếu vì đó là giao diện của app hpcons-quacuatoi,
//   không đổi được.
// - ITAsset không có route Thông báo/Tôi riêng (đã xác nhận qua navItems +
//   cấu trúc app/dashboard) nên chỉ còn 3 mục: Trang chủ, Làm mới, Mở tab.
function MucDieuHuong({ icon: Icon, label, title, onClick, noiBat }: { icon: LucideIcon; label: string; title?: string; onClick: () => void; noiBat?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title ?? label}
      className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors active:scale-95 ${noiBat ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
      <Icon size={20} />
      <span>{label}</span>
    </button>
  )
}

export default function GiftPopup({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const veTrangChu = () => { onClose(); router.push('/dashboard') }

  useEffect(() => {
    dialogRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center xl:p-4" style={{ background: 'rgba(3, 7, 18, 0.72)', backdropFilter: 'blur(3px)' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Quà của tôi" tabIndex={-1}
        className="relative shadow-2xl w-full h-full rounded-none p-0 outline-none xl:rounded-[3rem] xl:p-3.5 xl:w-[380px] xl:h-[min(800px,88vh)] border border-blue-900/40"
        style={{ background: 'linear-gradient(155deg, #1e3a8a, #030712)' }}>
        <button onClick={onClose} aria-label="Đóng"
          className="hidden xl:flex absolute -top-3.5 -right-3.5 w-10 h-10 rounded-full bg-white text-blue-600 border border-blue-100 shadow-lg items-center justify-center hover:scale-105 transition-transform">
          <X size={18} />
        </button>
        <div className="relative w-full h-full bg-white overflow-hidden flex flex-col rounded-none xl:rounded-[2.25rem]">
          <div className="flex xl:hidden shrink-0 items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-white">
            <span className="text-sm font-bold text-gray-800">🎁 Quà của tôi</span>
            <button type="button" onClick={onClose} aria-label="Đóng" className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="relative h-11 shrink-0 bg-white hidden xl:block">
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[118px] h-[26px] rounded-full bg-[#030712] flex items-center justify-end pr-2.5">
              <span className="w-2 h-2 rounded-full bg-blue-900" />
            </div>
          </div>
          <iframe ref={iframeRef} src={NHIEM_VU_URL} title="Quà của tôi — nhiệm vụ đổi điểm" className="flex-1 w-full border-0" loading="lazy" />
          <div className="grid grid-cols-3 shrink-0 border-t border-gray-100 bg-white">
            <MucDieuHuong icon={Home} label="Trang chủ" onClick={veTrangChu} />
            <MucDieuHuong icon={RotateCw} label="Làm mới" onClick={() => { if (iframeRef.current) iframeRef.current.src = NHIEM_VU_URL }} />
            <MucDieuHuong icon={ExternalLink} label="Mở tab" title="Mở tab đầy đủ" noiBat onClick={() => window.open(NHIEM_VU_URL, '_blank', 'noopener,noreferrer')} />
          </div>
          <div className="relative h-5 shrink-0 bg-white hidden xl:block">
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[120px] h-1 rounded-full bg-gray-900/20" />
          </div>
        </div>
      </div>
    </div>
  )
}
