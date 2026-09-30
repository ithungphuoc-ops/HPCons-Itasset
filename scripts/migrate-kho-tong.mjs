// Chuyển dữ liệu cũ (devices.quantity + assignments) sang cấu trúc Kho Tổng (30/09/2026):
//   • Số lượng cũ của thiết bị      → 1 phiếu Nhập kho "Số dư đầu kỳ"
//   • Mỗi lượt cấp phát cũ          → 1 phiếu Cấp phát (tên + phòng ban lấy từ hồ sơ nhân viên)
//   • Lượt đã trả (có ngày trả)     → thêm 1 phiếu Thu hồi
//   • devices.stock = { in, out, back, move } tính lại từ các phiếu trên (+ phiếu mới nếu đã có)
// Phiếu chuyển sang có so = null, legacy = true (in ra ghi "dữ liệu cũ"). KHÔNG xoá/sửa collection
// "assignments" cũ — giữ nguyên để đối chiếu. Chạy lại an toàn: thiết bị đã có stockMigratedAt bị bỏ qua.
//
// Cách chạy (ở thư mục gốc repo):
//   node scripts/migrate-kho-tong.mjs            → CHẠY THỬ: chỉ đọc + in báo cáo, không ghi gì
//   node scripts/migrate-kho-tong.mjs --apply    → ghi thật (chỉ chạy khi Sếp đã duyệt)
// Đọc credentials từ .env.local (FIREBASE_ADMIN_*). Có FIRESTORE_EMULATOR_HOST thì chạy trên emulator.
import { readFileSync, existsSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const APPLY = process.argv.includes('--apply')

function loadEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnv('.env.local')

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
if (process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: projectId || 'demo-kho-tong' })
else initializeApp({ credential: cert({ projectId, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n') }) })
const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

const normalizeVi = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D')).toLowerCase().trim().replace(/\s+/g, ' ')
const CAT = { laptop: 'Laptop', pc: 'PC', monitor: 'Màn hình', printer: 'Máy in', networking: 'Thiết bị mạng', component: 'Linh kiện', ups: 'UPS', peripheral: 'Phụ kiện', other: 'Khác' }
const devName = (d) => [CAT[d.category] || d.category, d.brand, d.model].filter(Boolean).join(' · ')
const day = (v) => (v ? String(v).slice(0, 10) : null)

async function main() {
  console.log(`\n=== Chuyển dữ liệu Kho Tổng — ${APPLY ? 'GHI THẬT' : 'CHẠY THỬ (không ghi)'} — project ${process.env.FIRESTORE_EMULATOR_HOST ? 'EMULATOR ' + process.env.FIRESTORE_EMULATOR_HOST : projectId} ===\n`)
  const [devSnap, asgSnap, empSnap, depSnap, mvSnap] = await Promise.all([
    db.collection('devices').get(), db.collection('assignments').get(), db.collection('employees').get(),
    db.collection('departments').get(), db.collection('stock_moves').get(),
  ])
  console.log(`Đọc: ${devSnap.size} thiết bị · ${asgSnap.size} lượt cấp phát cũ · ${empSnap.size} nhân viên · ${depSnap.size} phòng ban · ${mvSnap.size} phiếu mới đã có`)

  const deps = new Map(depSnap.docs.map((d) => [d.id, d.data().name]))
  const emps = new Map(empSnap.docs.map((d) => [d.id, d.data()]))
  const asgByDev = new Map()
  asgSnap.docs.forEach((d) => { const a = { id: d.id, ...d.data() }; (asgByDev.get(a.deviceId) || asgByDev.set(a.deviceId, []).get(a.deviceId)).push(a) })
  const newMovesByDev = new Map()
  mvSnap.docs.forEach((d) => { const m = d.data(); if (m.legacy) return; for (const l of m.lines || []) (newMovesByDev.get(l.deviceId) || newMovesByDev.set(l.deviceId, []).get(l.deviceId)).push({ type: m.type, qty: l.qty }) })

  // Gom theo TỪNG thiết bị: mọi phiếu + dấu stockMigratedAt của 1 thiết bị luôn nằm chung 1 batch
  // → bị ngắt giữa chừng thì thiết bị đó hoặc chưa ghi gì, hoặc đã ghi đủ (chạy lại không nhân đôi).
  const groups = [] // mỗi phần tử: danh sách [ref, data, merge] của 1 thiết bị
  let writes = []
  const warn = []
  let skipped = 0, nNK = 0, nXK = 0, nTH = 0
  const now = new Date().toISOString()

  for (const doc of devSnap.docs) {
    const d = { id: doc.id, ...doc.data() }
    if (d.stockMigratedAt) { skipped++; continue }
    writes = []
    groups.push(writes)
    const base = { lines: [], deviceIds: [d.id], dnSo: null, dnDate: null, so: null, legacy: true, createdAt: now, createdBy: 'chuyen-du-lieu' }
    const line = (qty, condition, note) => ({ deviceId: d.id, assetCode: d.assetCode, name: devName(d), serial: d.serialNumber ?? null, qty, condition, note: note || null })
    const st = { in: 0, out: 0, back: 0, move: 0 }

    const qty = Number(d.quantity) || 0
    if (qty > 0) {
      st.in += qty; nNK++
      writes.push([db.collection('stock_moves').doc(), { ...base, type: 'NK', date: day(d.purchaseDate) || day(d.createdAt) || now.slice(0, 10),
        info: { ncc: 'Số dư đầu kỳ (dữ liệu cũ)', nguoi: 'Chuyển dữ liệu', dien: 'Số lượng có sẵn trước khi dùng Kho Tổng' },
        lines: [line(qty, 'Đang sử dụng', null)], people: [] }])
    }
    const list = (asgByDev.get(d.id) || []).sort((a, b) => String(a.assignedDate).localeCompare(String(b.assignedDate)))
    for (const a of list) {
      const e = emps.get(a.employeeId)
      const nguoi = e?.fullName || `(nhân viên đã xoá ${a.employeeId})`
      const pb = (e?.departmentId && deps.get(e.departmentId)) || ''
      const q = Number(a.quantity) || 1
      st.out += q; nXK++
      writes.push([db.collection('stock_moves').doc(), { ...base, type: 'XK', date: day(a.assignedDate) || day(a.createdAt),
        info: { nguoi, pb, lydo: 'Cấp phát (dữ liệu cũ)' }, lines: [line(q, 'Đang sử dụng', a.notes)], people: [normalizeVi(nguoi)] }])
      if (!a.isActive) {
        st.back += q; nTH++
        writes.push([db.collection('stock_moves').doc(), { ...base, type: 'TH', date: day(a.returnedDate) || day(a.assignedDate),
          info: { nguoi, pb, lydo: 'Thu hồi (dữ liệu cũ)' }, lines: [line(q, d.status === 'broken' ? 'Hư' : 'Đã qua sử dụng', a.notes)], people: [normalizeVi(nguoi)] }])
      }
    }
    for (const m of newMovesByDev.get(d.id) || []) {
      if (m.type === 'NK') st.in += m.qty
      if (m.type === 'XK') st.out += m.qty
      if (m.type === 'TH') st.back += m.qty
      if (m.type === 'LC') st.move += m.qty
    }
    const left = st.in - st.out + st.back
    if (left < 0) {
      warn.push(`${d.assetCode}: số lượng cũ ${qty} nhưng đang cấp ${st.out - st.back} → cộng thêm ${-left} vào Nhập kho cho khớp`)
      st.in += -left
      const nk = writes.findLast((w) => w[1].type === 'NK' && w[1].deviceIds[0] === d.id)
      if (nk) nk[1].lines[0].qty += -left
      else { nNK++; writes.push([db.collection('stock_moves').doc(), { ...base, type: 'NK', date: day(d.createdAt) || now.slice(0, 10), info: { ncc: 'Số dư đầu kỳ (dữ liệu cũ)', nguoi: 'Chuyển dữ liệu', dien: 'Bổ sung cho khớp số đang cấp' }, lines: [line(-left, 'Đang sử dụng', null)], people: [] }]) }
    }
    const held = st.out - st.back
    if (held > 0 && d.status !== 'in_use') warn.push(`${d.assetCode}: đang cấp ${held} nhưng trạng thái cũ là "${d.status}" — giữ nguyên trạng thái`)
    writes.push([doc.ref, { stock: st, stockMigratedAt: now }, true])
  }

  console.log(`\nSẽ tạo: ${nNK} phiếu Nhập kho (số dư đầu kỳ) · ${nXK} phiếu Cấp phát · ${nTH} phiếu Thu hồi · cập nhật ${devSnap.size - skipped} thiết bị (bỏ qua ${skipped} đã chuyển trước đó)`)
  if (warn.length) { console.log(`\n⚠ ${warn.length} điểm cần xem:`); warn.forEach((w) => console.log('  - ' + w)) }
  if (!APPLY) { console.log('\n(Chạy thử — CHƯA ghi gì. Thêm --apply để ghi thật.)\n'); return }

  const total = groups.reduce((s, g) => s + g.length, 0)
  let done = 0
  for (let i = 0; i < groups.length;) {
    const batch = db.batch()
    let n = 0
    // Firestore tối đa 500 thao tác / batch — xếp nguyên nhóm, không cắt ngang 1 thiết bị
    while (i < groups.length && (n === 0 || n + groups[i].length <= 450)) {
      groups[i].forEach(([ref, data, merge]) => (merge ? batch.set(ref, data, { merge: true }) : batch.set(ref, data)))
      n += groups[i].length; i++
    }
    await batch.commit()
    done += n
    console.log(`  đã ghi ${done}/${total}`)
  }
  console.log('\n✓ Xong.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
