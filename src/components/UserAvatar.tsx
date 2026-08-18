'use client'

import { useEffect, useState } from 'react'

// Avatar người dùng đồng bộ live từ app tổng (account.hpcore.vn). Hiện ảnh
// nếu có avatarUrl, ngược lại rơi về chữ cái đầu tên/email. Ảnh tải lỗi (mạng
// chập chờn, ảnh bị xoá...) tự rơi về chữ cái thay vì hiện ô ảnh vỡ — trước
// đây thiếu lưới an toàn này, đúng lỗi Sếp báo + đã vá ở ttcuochop 18/08/2026
// nhưng ITAsset bị bỏ sót lúc đó (phát hiện qua code review).
export function UserAvatar({
  avatar,
  name,
  size = 32,
  className = '',
}: {
  avatar?: string | null
  name?: string | null
  size?: number
  className?: string
}) {
  const [imgError, setImgError] = useState(false)
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'

  // Đổi ảnh (vd người dùng sửa avatar ở app tổng, hoặc chuyển sang xem hồ sơ
  // người khác) → thử lại thay vì giữ mãi trạng thái lỗi cũ.
  useEffect(() => {
    setImgError(false)
  }, [avatar])

  if (avatar && !imgError) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar}
        alt={name || 'Avatar'}
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div
      className={`rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-medium shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  )
}
