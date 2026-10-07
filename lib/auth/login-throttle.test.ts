import { describe, expect, it } from 'vitest'
import {
  isLoginThrottled,
  LOGIN_MAX_FAILURES_PER_ACCOUNT,
  LOGIN_MAX_FAILURES_PER_ACCOUNT_IP,
  LOGIN_MAX_FAILURES_PER_IP,
  loginThrottleKey,
  UNAUDITABLE_IDENTIFIER,
} from '@/lib/auth/login-throttle'

describe('isLoginThrottled', () => {
  it('บัญชี + IP: ผิดน้อยกว่าเพดานยังลองได้ · ครบเพดานถูกพัก', () => {
    const base = { accountFailures: LOGIN_MAX_FAILURES_PER_ACCOUNT_IP, ipFailures: 0 }
    expect(isLoginThrottled({ ...base, accountIpFailures: LOGIN_MAX_FAILURES_PER_ACCOUNT_IP - 1 })).toBe(false)
    expect(isLoginThrottled({ ...base, accountIpFailures: LOGIN_MAX_FAILURES_PER_ACCOUNT_IP })).toBe(true)
  })

  it('คนนอกผิดครบเพดานจาก IP อื่น ⇒ เจ้าของบัญชีจาก IP ตัวเองยังเข้าได้ (R2-003)', () => {
    expect(
      isLoginThrottled({ accountIpFailures: 0, accountFailures: LOGIN_MAX_FAILURES_PER_ACCOUNT_IP * 3, ipFailures: 0 }),
    ).toBe(false)
  })

  it('บัญชี (ทุก IP): ไล่เดาแบบกระจาย IP ครบเพดานรวม ⇒ พักบัญชี', () => {
    expect(isLoginThrottled({ accountIpFailures: 0, accountFailures: LOGIN_MAX_FAILURES_PER_ACCOUNT - 1, ipFailures: 0 })).toBe(false)
    expect(isLoginThrottled({ accountIpFailures: 0, accountFailures: LOGIN_MAX_FAILURES_PER_ACCOUNT, ipFailures: 0 })).toBe(true)
  })

  it('ต่อ IP: ไล่เดาหลายบัญชีจากที่เดียวถูกพัก แม้แต่ละบัญชียังไม่ครบ', () => {
    expect(isLoginThrottled({ accountIpFailures: 1, accountFailures: 1, ipFailures: LOGIN_MAX_FAILURES_PER_IP - 1 })).toBe(false)
    expect(isLoginThrottled({ accountIpFailures: 1, accountFailures: 1, ipFailures: LOGIN_MAX_FAILURES_PER_IP })).toBe(true)
  })

  it('ไม่รู้ IP ⇒ ใช้เพดานเข้มรายบัญชีแทน', () => {
    const limit = LOGIN_MAX_FAILURES_PER_ACCOUNT_IP
    expect(isLoginThrottled({ accountIpFailures: null, accountFailures: limit - 1, ipFailures: null })).toBe(false)
    expect(isLoginThrottled({ accountIpFailures: null, accountFailures: limit, ipFailures: null })).toBe(true)
  })

  it('นับไม่ได้ทั้งหมด ⇒ ไม่พัก', () => {
    expect(isLoginThrottled({ accountIpFailures: null, accountFailures: null, ipFailures: null })).toBe(false)
    expect(isLoginThrottled({ accountIpFailures: null, accountFailures: null, ipFailures: LOGIN_MAX_FAILURES_PER_IP })).toBe(true)
  })
})

describe('loginThrottleKey', () => {
  it('บัญชีที่มีจริงใช้ user id — อีเมลกับ username ของคนเดียวกันนับร่วม (R2-002)', () => {
    expect(loginThrottleKey('u-1', 'manager@finance.example')).toBe('user:u-1')
    expect(loginThrottleKey('u-1', 'manager01')).toBe('user:u-1')
  })

  it('บัญชีที่ไม่มีใช้ identifier (ตัวพิมพ์เล็ก) · ไม่ถูกรูปแบบ = นับไม่ได้', () => {
    expect(loginThrottleKey(null, 'Ghost.User')).toBe('identifier:ghost.user')
    expect(loginThrottleKey(null, UNAUDITABLE_IDENTIFIER)).toBeNull()
  })
})
