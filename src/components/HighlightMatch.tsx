/**
 * Tô XANH LÁ phần chữ trùng — CHUẨN hệ sinh thái (17/08/2026, chép từ
 * hpcons-portal): bỏ dấu, tô MỌI chỗ trùng, an toàn NFD/emoji.
 * ITAsset nền tối: mark tự mang nền sáng riêng nên vẫn đọc tốt.
 */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}

export function normalizeSearch(s: string): string {
  return stripDiacritics(s).toLowerCase()
}

export default function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = normalizeSearch(query).trim()
  if (!q) return <>{text}</>
  const chars = [...text.normalize('NFC')]
  const map: number[] = []
  let norm = ''
  chars.forEach((ch, i) => {
    const n = normalizeSearch(ch)
    norm += n
    for (let k = 0; k < n.length; k++) map.push(i)
  })
  const ranges: [number, number][] = []
  let from = 0
  for (;;) {
    const at = norm.indexOf(q, from)
    if (at === -1) break
    ranges.push([map[at], map[at + q.length - 1] + 1])
    from = at + q.length
  }
  if (ranges.length === 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(chars.slice(cursor, start).join(''))
    parts.push(
      <mark key={i} className="rounded bg-green-100 px-0.5 font-semibold text-green-800">
        {chars.slice(start, end).join('')}
      </mark>,
    )
    cursor = end
  })
  if (cursor < chars.length) parts.push(chars.slice(cursor).join(''))
  return <>{parts}</>
}
