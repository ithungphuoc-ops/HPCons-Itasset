import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

// Có vai trò ở Cài đặt → Phân quyền của app IT nhưng HPcore chưa cấp quyền dùng app IT (tầng 1,
// phân quyền 2 tầng — Sếp chốt 23/10/2026). Proxy chuyển về đây thay vì /my-devices để báo rõ.
export default function NoAccessPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-3"><ShieldAlert className="text-amber-400" size={24} /></div>
        <h1 className="text-lg font-semibold mb-2">Chưa được cấp quyền dùng app IT ở HPcore</h1>
        <p className="text-sm text-gray-400 mb-5">
          Tài khoản của bạn đã có vai trò trong app IT, nhưng chưa được cấp quyền vào app ở HPcore.
          Nhờ Quản trị vào <b className="text-gray-200">HPcore → Quản lý ứng dụng → IT HPCons</b> cấp quyền, khoảng 30 giây sau tải lại trang.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <a href="https://account.hpcore.vn/dashboard" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm">Về HPcore</a>
          <Link href="/my-devices" className="px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 text-sm text-gray-300">Thiết bị của tôi</Link>
        </div>
      </div>
    </div>
  )
}
