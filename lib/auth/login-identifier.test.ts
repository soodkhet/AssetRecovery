import { describe, expect, it } from 'vitest'
import {
  authEmailFor,
  INTERNAL_AUTH_EMAIL_DOMAIN,
  internalAuthEmail,
  parseLoginIdentifier,
  USERNAME_PATTERN,
} from '@/lib/auth/login-identifier'

/** login ได้ทั้งอีเมลและ username — มติ PO 03/10/2569 */

describe('parseLoginIdentifier', () => {
  it('มี @ = อีเมล (normalize ตัวพิมพ์เล็ก + trim)', () => {
    expect(parseLoginIdentifier(' Somchai@Example.COM ')).toEqual({ kind: 'email', email: 'somchai@example.com' })
  })

  it('ไม่มี @ = username', () => {
    expect(parseLoginIdentifier('Agent.01')).toEqual({ kind: 'username', username: 'agent.01' })
  })
})

describe('USERNAME_PATTERN', () => {
  it('รับ a-z 0-9 . _ - ยาว 3–50 ขึ้นต้นด้วยตัวอักษร/ตัวเลข', () => {
    expect(USERNAME_PATTERN.test('somchai')).toBe(true)
    expect(USERNAME_PATTERN.test('agent_01.bkk-2')).toBe(true)
    expect(USERNAME_PATTERN.test('ab')).toBe(false)
    expect(USERNAME_PATTERN.test('.hidden')).toBe(false)
    expect(USERNAME_PATTERN.test('a@b')).toBe(false)
    expect(USERNAME_PATTERN.test('สมชาย')).toBe(false)
    expect(USERNAME_PATTERN.test('a'.repeat(51))).toBe(false)
  })
})

describe('authEmailFor', () => {
  it('มีอีเมลจริง → ใช้อีเมลจริง', () => {
    expect(authEmailFor({ id: 'u1', email: 'a@b.co' })).toBe('a@b.co')
  })

  it('ไม่มีอีเมล → อีเมลภายในผูกกับ id (ไม่ผูก username จึงเปลี่ยน username ได้อิสระ)', () => {
    expect(authEmailFor({ id: 'u1', email: null })).toBe(internalAuthEmail('u1'))
    expect(internalAuthEmail('u1')).toBe(`u1@${INTERNAL_AUTH_EMAIL_DOMAIN}`)
  })
})
