import type { Instrumentation } from "next";

/**
 * Báo cáo sự cố server (crash/500) về app tổng — nhật ký sự cố dùng chung
 * cho toàn hệ sinh thái (17/08/2026, xuất phát từ sự cố thật: Firebase
 * project HPC Đấu Thầu thiếu thẻ thanh toán khiến nhiều nhân viên không vào
 * được app cả buổi, nhưng KHÔNG có bản ghi nào để tra lại đã xảy ra lúc mấy
 * giờ). Xem lib/firestore/types.ts::FirestoreIncidentLog trong repo
 * hpcons-portal để biết đầy đủ bối cảnh.
 *
 * `onRequestError` là hook CHÍNH THỨC của Next.js (App Router) — được gọi
 * cho MỌI lỗi phía server (render trang, Route Handler, Server Action),
 * không cần bọc try/catch thủ công ở từng nơi.
 *
 * Cố ý KHÔNG throw ở bất kỳ đâu trong hàm này — lỗi khi BÁO CÁO lỗi không
 * được làm hỏng thêm gì cả, chỉ log ra console rồi bỏ qua.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  try {
    const secret = process.env.INCIDENT_LOG_SECRET;
    if (!secret) return; // chưa cấu hình ở env này — bỏ qua, không chặn gì

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    await fetch("https://account.hpcore.vn/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        appId: "itasset",
        appName: "HPC ITAsset",
        severity: "error",
        message: `[${context.routeType}] ${message}`,
        stack,
        path: request.path,
        occurredAt: Date.now(),
      }),
    });
  } catch (e) {
    console.error("[onRequestError] Không báo được sự cố về app tổng (bỏ qua):", e);
  }
};
