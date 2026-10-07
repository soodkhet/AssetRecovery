import { describe, expect, it } from 'vitest'
import {
  isLoginThrottled,
  LOGIN_MAX_FAILURES_PER_IDENTIFIER,
  LOGIN_MAX_FAILURES_PER_IP,
} from '@/lib/auth/login-throttle'

describe('isLoginThrottled', () => {
  it('ต่อบัญชี: ผิดน้อยกว่าเพดานยังลองได้ · ครบเพดานถูกพัก', () => {
    expect(isLoginThrottled({ identifierFailures: LOGIN_MAX_FAILURES_PER_IDENTIFIER - 1, ipFailures: 0 })).toBe(false)
    expect(isLoginThrottled({ identifierFailures: LOGIN_MAX_FAILURES_PER_IDENTIFIER, ipFailures: 0 })).toBe(true)
  })

  it('ต่อ IP: ไล่เดาหลายบัญชีจากที่เดียวถูกพัก แม้แต่ละบัญชียังไม่ครบ', () => {
    expect(isLoginThrottled({ identifierFailures: 1, ipFailures: LOGIN_MAX_FAILURES_PER_IP - 1 })).toBe(false)
    expect(isLoginThrottled({ identifierFailures: 1, ipFailures: LOGIN_MAX_FAILURES_PER_IP })).toBe(true)
  })

  it('นับไม่ได้ (identifier ไม่ถูกรูปแบบ / ไม่รู้ IP) ⇒ ไม่พักด้วยเกณฑ์นั้น', () => {
    expect(isLoginThrottled({ identifierFailures: null, ipFailures: null })).toBe(false)
    expect(isLoginThrottled({ identifierFailures: null, ipFailures: LOGIN_MAX_FAILURES_PER_IP })).toBe(true)
    expect(isLoginThrottled({ identifierFailures: LOGIN_MAX_FAILURES_PER_IDENTIFIER, ipFailures: null })).toBe(true)
  })
})
