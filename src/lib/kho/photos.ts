// Ảnh đính kèm phiếu (Sếp duyệt demo 22/10/2026) — dùng chung client + server.
//  • Ảnh thiết bị: chụp / chọn lúc lập phiếu (tuỳ chọn, Admin có thể bắt buộc theo từng loại phiếu)
//  • Ảnh phiếu đã ký: Cấp phát / Thu hồi / Luân chuyển phải in ra ký → tải ảnh phiếu đã ký lên sau

export interface MovePhoto { key: string; name: string; size: number }

// Khoá ảnh do máy chủ cấp: itasset/phieu/2026/10/<uuid>.jpg — chỉ nhận đúng dạng này (không cho trỏ file lạ)
export const PHOTO_KEY_RE = /^itasset\/phieu\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/
export const photoUrl = (key: string) => `/api/files/${key}`
// 1 ảnh sau khi thu nhỏ thường chỉ 100–400 KB; để 4 MB cho dưới giới hạn request ~4,5 MB của Vercel
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024

/** Làm sạch danh sách ảnh gửi lên (bỏ khoá sai dạng, trùng, quá số lượng) */
export function cleanPhotos(raw: unknown, max: number): MovePhoto[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: MovePhoto[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const r = p as Record<string, unknown>
    const key = typeof r.key === 'string' ? r.key : ''
    if (!PHOTO_KEY_RE.test(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ key, name: (typeof r.name === 'string' ? r.name : '').trim().slice(0, 120) || 'anh.jpg', size: Math.max(0, Math.min(Number(r.size) || 0, PHOTO_MAX_BYTES)) })
    if (out.length >= max) break
  }
  return out
}

/** Thu nhỏ ảnh ở trình duyệt trước khi tải lên: cạnh dài tối đa 1600px, JPEG 80% (xoay đúng chiều theo EXIF) */
export async function compressImage(file: File, maxSide = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k))
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height) // nền trong suốt (PNG) → trắng
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Không thu nhỏ được ảnh'))), 'image/jpeg', 0.8))
}

/** Thu nhỏ + tải 1 ảnh lên máy chủ (R2) → trả về khoá ảnh để gắn vào phiếu */
export async function uploadPhoto(file: File): Promise<MovePhoto> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" không phải ảnh`)
  const blob = await compressImage(file).catch(() => { throw new Error(`Không đọc được ảnh "${file.name}" (thử chụp / chọn ảnh JPG, PNG)`) })
  const fd = new FormData()
  fd.append('file', blob, file.name.replace(/\.[^.]+$/, '') + '.jpg')
  const res = await fetch('/api/uploads', { method: 'POST', body: fd })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Tải ảnh lên thất bại')
  return json.data as MovePhoto
}
