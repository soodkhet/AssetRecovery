'use client'

import { useSyncExternalStore } from 'react'

/** จอแคบ = ต่ำกว่า breakpoint `sm` ของ Tailwind (640px) */
const NARROW_QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function snapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches
}

/**
 * จอแคบหรือไม่ (ใช้ปรับสิ่งที่ CSS ทำแทนไม่ได้ เช่น ป้ายแกนของกราฟ Recharts — BUG-146)
 * · ฝั่ง server ถือว่าไม่แคบ (render แบบจอกว้างก่อน แล้วปรับเมื่อ hydrate)
 */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
