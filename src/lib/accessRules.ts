// Quy tắc phân quyền 2 tầng (Sếp chốt 23/10/2026) — hàm thuần, dùng chung proxy.ts + lib/session.ts để
// 2 nơi không bao giờ lệch nhau (lỗi cũ: proxy đọc vai trò app IT, API lại đọc vai trò HPcore).
//  • Tầng 1 — HPcore cấp dùng app IT ("granted") hoặc là chủ sở hữu ("owner"). Lỗi đọc HPcore ("error") → cho
//    qua để mạng chập chờn không khoá cả công ty (vẫn cần tầng 2).
//  • Tầng 2 — vai trò ở Cài đặt → Phân quyền của app IT. Owner luôn là Admin.
export type HpcoreAccess = 'owner' | 'granted' | 'none' | 'error'
export const DASHBOARD_ROLES = ['admin', 'it_staff', 'viewer'] as const

export const passesHpcore = (a: HpcoreAccess) => a !== 'none'

/** Vai trò có hiệu lực trong app IT (null = không có quyền dashboard → nhân viên thường) */
export function effectiveRole(access: HpcoreAccess, localRole: string | null | undefined): string | null {
  if (access === 'owner') return 'admin'
  if (!passesHpcore(access)) return null
  return localRole && (DASHBOARD_ROLES as readonly string[]).includes(localRole) ? localRole : null
}

/** Có vai trò trong app IT nhưng HPcore chưa cấp → báo rõ (trang /no-access) thay vì coi như nhân viên thường */
export function blockedByHpcore(access: HpcoreAccess, localRole: string | null | undefined): boolean {
  return access === 'none' && !!localRole && (DASHBOARD_ROLES as readonly string[]).includes(localRole)
}
