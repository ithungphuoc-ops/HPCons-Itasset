// Kiểu dữ liệu Firestore (camelCase) — dùng nội bộ trong tầng data-access.
// Route Handler tự map sang shape cũ (snake_case, xem src/lib/types/index.ts)
// trước khi trả JSON, để giữ nguyên hợp đồng API cho phần còn lại của app.

export type DeviceCategory =
  | "laptop"
  | "monitor"
  | "pc"
  | "peripheral"
  | "printer"
  | "networking"
  | "component"
  | "ups"
  | "other";

export type DeviceStatus = "in_use" | "in_stock" | "broken" | "liquidated";

export type UserRole = "admin" | "it_staff" | "viewer";

export interface FirestoreDepartment {
  id: string;
  name: string;
  createdAt: string;
}

export interface FirestoreEmployee {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  employeeCode: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface LaptopSpecs {
  cpu: string | null;
  ram: string | null;
  storage: string | null;
  display: string | null;
  os: string | null;
  gpu: string | null;
  // Có trong dữ liệu Supabase thật (device_laptop_specs) nhưng UI hiện tại
  // (form thêm/sửa thiết bị) chưa có ô nhập — giữ lại khi migrate để không mất
  // dữ liệu, hiển thị dạng "phần bổ sung" nếu có giá trị.
  mainBoard: string | null;
  powerSupply: string | null;
}

export interface MonitorSpecs {
  screenSize: string | null;
  resolution: string | null;
  panelType: string | null;
  refreshRate: string | null;
}

export interface FirestoreDevice {
  id: string;
  assetCode: string;
  category: DeviceCategory;
  brand: string;
  model: string;
  serialNumber: string | null;
  status: DeviceStatus;
  purchaseDate: string | null;
  purchasePrice: number | null;
  warrantyExpiry: string | null;
  notes: string | null;
  imageUrl: string | null;
  qrCode: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  laptopSpecs: LaptopSpecs | null;
  monitorSpecs: MonitorSpecs | null;
}

export interface FirestoreAssignment {
  id: string;
  deviceId: string;
  employeeId: string;
  assignedDate: string;
  returnedDate: string | null;
  assignedBy: string | null;
  returnedBy: string | null;
  notes: string | null;
  isActive: boolean;
  quantity: number;
  createdAt: string;
}

// profiles/{uid} — người đăng nhập dashboard (admin/it_staff/viewer).
// Khác với FirestoreEmployee (người được cấp thiết bị, không nhất thiết đăng nhập).
export interface FirestoreProfile {
  id: string; // Firebase Auth uid
  fullName: string;
  role: UserRole;
  createdAt: string;
  // Avatar đồng bộ live từ app tổng (users/{uid}.avatarUrl ở Firestore
  // hpcons-portal) — không lưu cục bộ, null nếu người dùng chưa có avatar.
  avatar?: string | null;
}

// tasks/{id} — module "Công việc" (ticket sửa chữa/bảo hành/cài đặt/hỗ trợ IT), bổ sung
// 25/09/2026 từ app "Trạm IT" (bản dựng riêng buổi sáng cùng ngày, xem báo cáo so sánh trong
// hội thoại). Module HOÀN TOÀN MỚI — không có gốc Supabase — nên dùng camelCase xuyên suốt cả ở
// tầng Firestore lẫn JSON trả về cho frontend, KHÔNG theo quy ước snake_case như Device/
// Employee/Assignment (vốn giữ snake_case để tương thích hợp đồng API cũ thời Supabase).
export type TaskType = "repair" | "warranty" | "install" | "support" | "other";
export type TaskPriority = "high" | "medium" | "low";

export interface FirestoreTask {
  id: string;
  type: TaskType;
  title: string;
  requesterName: string;
  // Chưa nối danh sách nhân viên IT thật (chờ xác nhận nguồn dữ liệu nhân sự) — tạm nhập tay,
  // xem TASK_ASSIGNEES ở src/lib/types/index.ts.
  assigneeName: string | null;
  deviceId: string | null;
  priority: TaskPriority;
  dueDate: string; // yyyy-mm-dd
  // Trạng thái hiển thị (Mới/Quá hạn/Hoàn thành/Hoàn thành quá hạn) KHÔNG lưu ở đây — luôn tính
  // tự động từ (dueDate, completed) lúc hiển thị, xem src/lib/task-status.ts. Tránh lưu field
  // trạng thái tĩnh dễ lệch với ngày thực tế (bài học rút ra khi làm Trạm IT buổi sáng).
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}
