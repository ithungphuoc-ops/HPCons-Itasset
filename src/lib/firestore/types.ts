// Kiểu dữ liệu Firestore (camelCase) — dùng nội bộ trong tầng data-access.
// Route Handler tự map sang shape cũ (snake_case, xem src/lib/types/index.ts)
// trước khi trả JSON, để giữ nguyên hợp đồng API cho phần còn lại của app.

// Mã Loại: 9 loại có sẵn (laptop, monitor, pc, peripheral, printer, networking, component, ups, other)
// + Loại Admin tự thêm ở "Sửa giao diện" (Đợt 2, 01/10/2026) → chuỗi bất kỳ.
export type DeviceCategory = string;

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
  // ---- Kho Tổng (30/09/2026) ----
  // Thông số kĩ thuật theo tên trường Sếp thiết kế (xem lib/kho/config.ts::SPEC_FIELDS)
  specs?: Record<string, string> | null;
  // Bảo hành dạng khoảng: warrantyFrom → warrantyExpiry (giữ tên cũ cho ngày kết thúc)
  warrantyFrom?: string | null;
  // Số tổng cộng dồn, cập nhật trong CÙNG transaction với phiếu (lib/firestore/moves.ts) để trang
  // danh sách chỉ cần đọc bảng devices — không phải cộng lại từ lịch sử (tiết kiệm lượt đọc).
  // Thiếu (thiết bị chưa chuyển dữ liệu cũ) → coi như { in: quantity, out: 0, back: 0, move: 0 }.
  stock?: { in: number; out: number; back: number; move: number } | null;
  // Trường bổ sung ở Thông tin chung do Admin thêm (Đợt 2) — key = ExtraField.key (lib/kho/settings.ts)
  extra?: Record<string, string> | null;
}

// stock_moves/{id} — 1 PHIẾU nhập kho / cấp phát (xuất kho) / thu hồi / luân chuyển, gồm nhiều
// dòng thiết bị. Tên người + phòng ban GÕ TAY (Sếp chốt 30/09 — không lấy HPcore cho đỡ tốn đọc).
export type MoveType = "NK" | "XK" | "TH" | "LC";
export interface MoveLine {
  deviceId: string;
  assetCode: string;
  name: string;          // "Loại · Hãng · Model" chụp lại lúc lập phiếu (in lại vẫn đúng)
  serial: string | null;
  qty: number;
  condition: string;     // Tình trạng
  note: string | null;
}
export interface FirestoreMove {
  id: string;
  type: MoveType;
  so: string | null;     // NK260001… ; null = dữ liệu cũ chuyển sang
  date: string;          // yyyy-mm-dd (người dùng chọn)
  info: Partial<Record<"ncc" | "nguoi" | "pb" | "nguoi2" | "pb2" | "lydo" | "dien", string>>;
  dnSo: string | null;   // Theo đề nghị số
  dnDate: string | null;
  lines: MoveLine[];
  deviceIds: string[];   // để query array-contains khi mở chi tiết 1 thiết bị
  people: string[];      // tên người đã chuẩn hoá (bỏ dấu) — cho "Thiết bị của tôi"
  createdAt: string;
  createdBy: string | null;
  legacy?: boolean;      // true = chuyển từ assignments cũ
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
