import type { PushSubscribeInput } from '@/lib/field/schemas'

/**
 * ตรรกะฝั่งอุปกรณ์ของ Web Push + PWA (`41` §15) — **pure ล้วน** (ไม่แตะ `window`/`navigator` เอง
 * เพื่อให้เทสต์ได้ · component เป็นคนอ่านค่าจริงมาส่งเข้ามา)
 *
 * กติกาจาก §15 ที่บังคับที่นี่:
 * - Android/Chrome/Desktop ใช้ได้เต็มรูปแบบ · **iOS Safari ได้ push เฉพาะเมื่อ "เพิ่มลงหน้าจอโฮม" แล้ว**
 * - A2HS **ไม่บังคับ** — แค่แนะนำด้วยแบนเนอร์ ปิดแล้วต้องไม่กวนซ้ำ
 * - push ไม่ใช่ช่องทางเดียว: fallback หลักคือ in-app notification ⇒ ทุกเส้นทางที่นี่ล้มเหลวได้อย่างเงียบ ๆ
 */

/** สภาพแวดล้อมของอุปกรณ์ที่หน้าจออ่านมาให้ */
export interface PushEnvironment {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  isIOS: boolean
  /** เปิดจากไอคอนบนหน้าจอโฮมแล้ว (`display-mode: standalone`) */
  isStandalone: boolean
}

export type PushAvailability =
  /** ขอสิทธิ์แล้วสมัครรับ push ได้เลย */
  | 'ready'
  /** iOS ที่ยังเปิดผ่านแท็บ Safari — ต้อง "เพิ่มลงหน้าจอโฮม" ก่อนถึงจะได้ push (§15) */
  | 'needs_a2hs'
  /** เบราว์เซอร์ไม่รองรับ — ใช้แอปได้ตามปกติ แค่ไม่มี push */
  | 'unsupported'

export function pushAvailability(env: PushEnvironment): PushAvailability {
  // iOS ที่ยังไม่ A2HS จะไม่มี PushManager ให้เห็นเลย — แยกออกจาก "ไม่รองรับจริง" เพื่อชวนติดตั้งแทน
  if (env.isIOS && !env.isStandalone) return 'needs_a2hs'
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported'
  return 'ready'
}

/** iPadOS 13+ รายงานตัวเป็น Mac — ใช้ touch point ช่วยแยก (ค่าจาก `navigator.maxTouchPoints`) */
export function detectIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1
}

export const A2HS_DISMISS_KEY = 'field.a2hs.dismissed'

/**
 * แบนเนอร์ "เพิ่มลงหน้าจอโฮม" — โชว์เฉพาะ iOS ที่ยังไม่ติดตั้งและยังไม่เคยกดปิด
 * (§15 "ไม่บังคับขั้นตอนนี้ แค่แนะนำตอน onboarding ครั้งแรก")
 */
export function shouldShowA2hsBanner(env: PushEnvironment, dismissed: boolean): boolean {
  if (dismissed) return false
  return pushAvailability(env) === 'needs_a2hs'
}

/** ปุ่ม "เปิดการแจ้งเตือน" โชว์เมื่อสมัครได้จริง ยังไม่เคยตอบคำขอสิทธิ์ และยังไม่ได้สมัครไว้ */
export function shouldOfferPushPrompt(
  env: PushEnvironment,
  permission: 'default' | 'granted' | 'denied',
  alreadySubscribed: boolean,
): boolean {
  if (pushAvailability(env) !== 'ready') return false
  if (permission !== 'default') return false
  return !alreadySubscribed
}

/**
 * VAPID public key (base64url) → `Uint8Array` สำหรับ `pushManager.subscribe()`
 * คืน `null` เมื่อคีย์ว่าง/ไม่ถูกต้อง — หน้าจอต้องข้ามการสมัครไปเงียบ ๆ (in-app ยังทำงาน)
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> | null {
  const trimmed = base64Url.trim()
  if (trimmed === '') return null
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4)
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/')
  try {
    const raw = atob(base64)
    // ระบุ `ArrayBuffer` ชัด ๆ เพราะ `pushManager.subscribe()` ไม่รับ `SharedArrayBuffer`
    const output = new Uint8Array(new ArrayBuffer(raw.length))
    for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
    return output
  } catch {
    return null
  }
}

/** ผลของ `PushSubscription.toJSON()` — แปลงเป็น body ของ `POST /api/field/push/subscribe` */
export interface RawPushSubscription {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export function toPushSubscribeInput(raw: RawPushSubscription): PushSubscribeInput | null {
  const endpoint = raw.endpoint ?? ''
  const p256dh = raw.keys?.p256dh ?? ''
  const auth = raw.keys?.auth ?? ''
  if (endpoint === '' || p256dh === '' || auth === '') return null
  return { endpoint, keys: { p256dh, auth } }
}

// ── กล่องแจ้งเตือนในแอป (fallback หลักของ §15) ──────────────────────────────

/** badge บนกระดิ่ง — เกิน 99 แสดง `99+` (กันเลขล้นกรอบบนมือถือ) */
export function unreadBadgeText(unreadCount: number): string | null {
  if (unreadCount <= 0) return null
  return unreadCount > 99 ? '99+' : String(unreadCount)
}

/** ปลายทางของการแจ้งเตือน — กัน open redirect: รับเฉพาะ path ภายในแอปเท่านั้น */
export function notificationHref(linkPath: string | null): string | null {
  if (linkPath === null || linkPath.trim() === '') return null
  return linkPath.startsWith('/') && !linkPath.startsWith('//') ? linkPath : null
}
