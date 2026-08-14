import { describe, expect, it } from 'vitest'
import {
  detectIOS,
  notificationHref,
  pushAvailability,
  shouldOfferPushPrompt,
  shouldShowA2hsBanner,
  toPushSubscribeInput,
  unreadBadgeText,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from '@/lib/field/push-client'
import { pushSubscribeSchema } from '@/lib/field/schemas'

function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    isIOS: false,
    isStandalone: false,
    ...overrides,
  }
}

describe('ความพร้อมของ Web Push (`41` §15)', () => {
  it('Android/Chrome/Desktop ใช้ได้เต็มรูปแบบ', () => {
    expect(pushAvailability(env())).toBe('ready')
  })

  it('iOS ที่ยังเปิดผ่านแท็บ Safari ต้อง A2HS ก่อน', () => {
    expect(pushAvailability(env({ isIOS: true, hasPushManager: false }))).toBe('needs_a2hs')
    expect(pushAvailability(env({ isIOS: true }))).toBe('needs_a2hs')
  })

  it('iOS ที่เพิ่มลงหน้าจอโฮมแล้วใช้ได้', () => {
    expect(pushAvailability(env({ isIOS: true, isStandalone: true }))).toBe('ready')
  })

  it('เบราว์เซอร์ที่ไม่รองรับ = unsupported (ไม่ใช่ needs_a2hs)', () => {
    expect(pushAvailability(env({ hasServiceWorker: false }))).toBe('unsupported')
    expect(pushAvailability(env({ hasNotification: false }))).toBe('unsupported')
  })

  it('iPadOS 13+ ที่รายงานตัวเป็น Mac ยังถูกจับได้ด้วย touch point', () => {
    expect(detectIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(true)
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(detectIOS('Mozilla/5.0 (Linux; Android 14)')).toBe(false)
  })
})

describe('แบนเนอร์ A2HS ไม่บังคับ (`41` §15)', () => {
  it('โชว์เฉพาะ iOS ที่ยังไม่ติดตั้ง', () => {
    expect(shouldShowA2hsBanner(env({ isIOS: true }), false)).toBe(true)
    expect(shouldShowA2hsBanner(env({ isIOS: true, isStandalone: true }), false)).toBe(false)
    expect(shouldShowA2hsBanner(env(), false)).toBe(false)
  })

  it('กดปิดแล้วต้องไม่กวนซ้ำ', () => {
    expect(shouldShowA2hsBanner(env({ isIOS: true }), true)).toBe(false)
  })
})

describe('คำขอสิทธิ์แจ้งเตือน', () => {
  it('เสนอเฉพาะตอนยังไม่เคยตอบและยังไม่ได้สมัคร', () => {
    expect(shouldOfferPushPrompt(env(), 'default', false)).toBe(true)
    expect(shouldOfferPushPrompt(env(), 'default', true)).toBe(false)
    expect(shouldOfferPushPrompt(env(), 'denied', false)).toBe(false)
    expect(shouldOfferPushPrompt(env(), 'granted', false)).toBe(false)
  })

  it('อุปกรณ์ที่ยังต้อง A2HS หรือไม่รองรับ ไม่เสนอปุ่ม', () => {
    expect(shouldOfferPushPrompt(env({ isIOS: true }), 'default', false)).toBe(false)
    expect(shouldOfferPushPrompt(env({ hasPushManager: false }), 'default', false)).toBe(false)
  })
})

describe('VAPID key + payload ของ subscription', () => {
  it('แปลง base64url เป็น Uint8Array ได้', () => {
    // 'hello' ในรูป base64url ที่ไม่มี padding
    const bytes = urlBase64ToUint8Array('aGVsbG8')
    expect(bytes).not.toBeNull()
    expect([...(bytes ?? [])]).toEqual([104, 101, 108, 108, 111])
  })

  it('รองรับอักขระ `-`/`_` ของ base64url', () => {
    expect(urlBase64ToUint8Array('-_-_')).not.toBeNull()
  })

  it('คีย์ว่าง/พังคืน null (หน้าจอข้ามการสมัครเงียบ ๆ)', () => {
    expect(urlBase64ToUint8Array('')).toBeNull()
    expect(urlBase64ToUint8Array('   ')).toBeNull()
    expect(urlBase64ToUint8Array('###')).toBeNull()
  })

  it('payload ที่ได้ผ่าน schema เดียวกับฝั่ง BE', () => {
    const input = toPushSubscribeInput({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
    })
    expect(input).not.toBeNull()
    expect(pushSubscribeSchema.safeParse(input).success).toBe(true)
  })

  it('subscription ที่ข้อมูลไม่ครบคืน null', () => {
    expect(toPushSubscribeInput({})).toBeNull()
    expect(toPushSubscribeInput({ endpoint: 'https://push.example.com/abc' })).toBeNull()
    expect(
      toPushSubscribeInput({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x' } }),
    ).toBeNull()
  })
})

describe('กล่องแจ้งเตือนในแอป (fallback หลัก `41` §15)', () => {
  it('badge เกิน 99 แสดง 99+ · 0 ไม่แสดง', () => {
    expect(unreadBadgeText(0)).toBeNull()
    expect(unreadBadgeText(-1)).toBeNull()
    expect(unreadBadgeText(5)).toBe('5')
    expect(unreadBadgeText(100)).toBe('99+')
  })

  it('รับเฉพาะ path ภายในแอป (กัน open redirect)', () => {
    expect(notificationHref('/field/tracking')).toBe('/field/tracking')
    expect(notificationHref(null)).toBeNull()
    expect(notificationHref('  ')).toBeNull()
    expect(notificationHref('https://evil.example.com')).toBeNull()
    expect(notificationHref('//evil.example.com')).toBeNull()
  })
})
