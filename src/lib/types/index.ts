// 9 loại có sẵn; từ Đợt 2 (01/10/2026) Admin thêm được Loại mới ở "Sửa giao diện" → DeviceCategory là chuỗi bất kỳ
export type BuiltinCategory = 'laptop' | 'monitor' | 'pc' | 'peripheral' | 'printer' | 'networking' | 'component' | 'ups' | 'other'
export type DeviceCategory = string
export type DeviceStatus = 'in_use' | 'in_stock' | 'broken' | 'liquidated'
export type UserRole = 'admin' | 'it_staff' | 'viewer'

export interface Department {
  id: string
  name: string
  created_at: string
}

export interface Employee {
  id: string
  full_name: string
  email?: string
  phone?: string
  department_id?: string
  employee_code?: string
  is_active: boolean
  created_at: string
  department?: Department
}

export interface LaptopSpecs {
  device_id: string
  cpu?: string
  ram?: string
  storage?: string
  display?: string
  os?: string
  gpu?: string
}

export interface MonitorSpecs {
  device_id: string
  screen_size?: string
  resolution?: string
  panel_type?: string
  refresh_rate?: string
}

export interface Device {
  id: string
  asset_code: string
  category: DeviceCategory
  brand: string
  model: string
  serial_number?: string
  status: DeviceStatus
  purchase_date?: string
  purchase_price?: number
  warranty_expiry?: string
  notes?: string
  image_url?: string
  qr_code: string
  quantity: number
  created_at: string
  updated_at: string
  laptop_specs?: LaptopSpecs
  monitor_specs?: MonitorSpecs
  current_assignment?: Assignment
}

export interface Assignment {
  id: string
  device_id: string
  employee_id: string
  assigned_date: string
  returned_date?: string
  assigned_by?: string
  returned_by?: string
  notes?: string
  is_active: boolean
  quantity: number
  created_at: string
  employee?: Employee
  device?: Device
}

export interface Profile {
  id: string
  full_name?: string
  role: UserRole
  created_at: string
}

// Công việc (ticket IT) — bổ sung 25/09/2026, camelCase xuyên suốt (xem ghi chú ở
// lib/firestore/types.ts::FirestoreTask).
export type TaskType = 'repair' | 'warranty' | 'install' | 'support' | 'other'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  type: TaskType
  title: string
  requesterName: string
  assigneeName: string | null
  deviceId: string | null
  priority: TaskPriority
  dueDate: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

// Chưa nối danh sách nhân viên IT thật (chờ xác nhận nguồn dữ liệu HPcore) — tạm cố định,
// giống cách app "Trạm IT" đã làm sáng 25/09/2026.
export const TASK_ASSIGNEES = ['Trần Minh Khoa', 'Đỗ Thành Nam', 'Chưa phân công']
