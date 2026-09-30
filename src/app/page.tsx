import { redirect } from 'next/navigation'

// Kho Tổng (30/09/2026): từ HPcore chọn ứng dụng là vào THẲNG giao diện — không còn trang giới
// thiệu có nút "Vào Dashboard". proxy.ts vẫn chặn /dashboard nếu chưa đăng nhập / chưa có quyền.
export default function HomePage() {
  redirect('/dashboard')
}
