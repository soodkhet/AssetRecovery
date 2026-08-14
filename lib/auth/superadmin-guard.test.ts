import { describe, expect, it } from 'vitest'
import { assertNotLastSuperadmin, violatesLastSuperadminRule, type LastSuperadminCheck } from '@/lib/auth/superadmin-guard'
import { AuthError } from '@/lib/auth/errors'

function check(overrides: Partial<LastSuperadminCheck> = {}): LastSuperadminCheck {
  return {
    isSuperadminNow: true,
    isActiveNow: true,
    willBeSuperadmin: true,
    willBeActive: true,
    activeSuperadminCount: 1,
    ...overrides,
  }
}

describe('LAST_SUPERADMIN_REMOVAL (`05` §10/§16 · `07` §11)', () => {
  it('deactivate Superadmin คนสุดท้าย = reject', () => {
    expect(violatesLastSuperadminRule(check({ willBeActive: false }))).toBe(true)
    expect(() => assertNotLastSuperadmin(check({ willBeActive: false }))).toThrowError(AuthError)
  })

  it('ย้าย role ของ Superadmin คนสุดท้ายออก = reject', () => {
    expect(violatesLastSuperadminRule(check({ willBeSuperadmin: false }))).toBe(true)
  })

  it('ยังมี Superadmin คนอื่น active = ผ่าน', () => {
    expect(violatesLastSuperadminRule(check({ willBeActive: false, activeSuperadminCount: 2 }))).toBe(false)
  })

  it('แก้ไขอย่างอื่นของ Superadmin (ยังเป็น Superadmin + active) = ผ่าน', () => {
    expect(violatesLastSuperadminRule(check())).toBe(false)
  })

  it('user ที่ไม่ใช่ Superadmin หรือไม่ active อยู่แล้ว ไม่เกี่ยวกับกฎนี้', () => {
    expect(violatesLastSuperadminRule(check({ isSuperadminNow: false, willBeSuperadmin: false }))).toBe(false)
    expect(violatesLastSuperadminRule(check({ isActiveNow: false, willBeActive: false }))).toBe(false)
  })

  it('error ที่โยนออกมาใช้ code ตาม `24` §6.9 และตอบ 400', () => {
    try {
      assertNotLastSuperadmin(check({ willBeActive: false }))
      expect.unreachable('ต้องโยน AuthError')
    } catch (error) {
      expect(error).toBeInstanceOf(AuthError)
      expect((error as AuthError).code).toBe('LAST_SUPERADMIN_REMOVAL')
      expect((error as AuthError).status).toBe(400)
    }
  })
})
