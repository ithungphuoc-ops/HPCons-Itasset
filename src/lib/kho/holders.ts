// "Đang giữ thiết bị": cộng từ các phiếu — Cấp phát (người nhận +), Thu hồi (người giao trả −),
// Luân chuyển (người chuyển −, người nhận +). Gộp theo tên đã bỏ dấu vì tên gõ tay (Sếp chốt 30/09).
// Dùng chung client + server.
import { normalizeVi } from '@/lib/kho/config'

interface MoveLike {
  type: 'NK' | 'XK' | 'TH' | 'LC'
  info: { nguoi?: string; pb?: string; nguoi2?: string; pb2?: string }
  lines: { deviceId: string; qty: number }[]
  date: string
}

export interface Holder { key: string; name: string; pb: string; deviceId: string; qty: number; since: string }

export function computeHolders(moves: MoveLike[], onlyDeviceId?: string): Holder[] {
  const map = new Map<string, Holder>()
  const add = (name: string | undefined, pb: string | undefined, deviceId: string, qty: number, date: string) => {
    const n = (name || '').trim()
    if (!n) return
    const key = normalizeVi(n) + '|' + deviceId
    const h = map.get(key) || { key, name: n, pb: pb || '', deviceId, qty: 0, since: date }
    h.qty += qty
    if (qty > 0) {
      // Giữ cách viết "đẹp" nhất (có chữ hoa) — phiếu sau lỡ gõ chữ thường thì không đè tên đã đúng
      if (n !== n.toLowerCase() || h.name === h.name.toLowerCase()) h.name = n
      if (pb) h.pb = pb
      if (date > h.since || h.qty === qty) h.since = date
    }
    map.set(key, h)
  }
  const sorted = [...moves].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const m of sorted) {
    for (const l of m.lines) {
      if (onlyDeviceId && l.deviceId !== onlyDeviceId) continue
      if (m.type === 'XK') add(m.info.nguoi, m.info.pb, l.deviceId, l.qty, m.date)
      else if (m.type === 'TH') add(m.info.nguoi, m.info.pb, l.deviceId, -l.qty, m.date)
      else if (m.type === 'LC') { add(m.info.nguoi, m.info.pb, l.deviceId, -l.qty, m.date); add(m.info.nguoi2, m.info.pb2, l.deviceId, l.qty, m.date) }
    }
  }
  return [...map.values()].filter(h => h.qty !== 0).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
}
