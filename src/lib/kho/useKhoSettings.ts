'use client'
// Đọc cấu hình "Sửa giao diện" ở trình duyệt — tải 1 lần / phiên (dùng chung mọi trang), trong lúc
// chờ thì dùng mặc định. Lưu xong ở trang Sửa giao diện gọi setKhoSettingsCache() để mọi nơi đổi theo.
import { useEffect, useState } from 'react'
import { defaultSettings, type KhoSettings } from '@/lib/kho/settings'

const DEFAULTS = defaultSettings()
let cache: KhoSettings | null = null
let inflight: Promise<KhoSettings> | null = null
let loadedAt = 0
const listeners = new Set<(s: KhoSettings) => void>()

function load(): Promise<KhoSettings> {
  if (!inflight) {
    inflight = fetch('/api/kho-settings')
      .then((r) => r.json())
      .then((j) => { cache = (j.data as KhoSettings) || DEFAULTS; loadedAt = Date.now(); listeners.forEach((f) => f(cache!)); return cache })
      .catch(() => { inflight = null; return DEFAULTS })
  }
  return inflight
}

export function setKhoSettingsCache(s: KhoSettings) {
  cache = s
  inflight = Promise.resolve(s)
  listeners.forEach((f) => f(s))
}

/** Trả về cấu hình hiện tại + cờ đã tải xong chưa */
export function useKhoSettings(): { settings: KhoSettings; ready: boolean } {
  const [s, setS] = useState<KhoSettings | null>(cache)
  useEffect(() => {
    listeners.add(setS)
    if (!cache) load()
    // Quay lại tab sau ≥ 60s → tải lại (người khác có thể vừa sửa giao diện)
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - loadedAt > 60_000) { inflight = null; load() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { listeners.delete(setS); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return { settings: s || cache || DEFAULTS, ready: !!(s || cache) }
}
