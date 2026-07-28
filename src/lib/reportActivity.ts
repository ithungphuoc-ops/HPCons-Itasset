"use client";

/**
 * Báo 1 hành động quản trị quan trọng (CRUD phòng ban, CRUD nhân viên, CRUD
 * user quản trị...) về nhật ký hoạt động tập trung ở app tổng — xem
 * openspec/changes/cross-app-activity-log ở hpcons-portal. Gọi từ trình
 * duyệt (dùng cookie phiên .hpcore.vn có sẵn qua credentials:'include'),
 * KHÔNG chặn/làm gián đoạn thao tác chính nếu gửi log thất bại.
 */
export function reportActivity(input: {
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
}) {
  fetch("https://account.hpcore.vn/api/activity", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, appName: "ITAsset", pageUrl: typeof window !== "undefined" ? window.location.href : undefined }),
  }).catch(() => {
    /* không chặn thao tác chính nếu gửi log thất bại */
  });
}
