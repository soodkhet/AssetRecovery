import { describe, expect, it } from 'vitest'
import {
  COMPANY_NOT_LINKED_MESSAGE,
  LOGIN_REASON_COMPANY_NOT_LINKED,
  authErrorMessage,
  loginReasonMessage,
  portalCompanyDenyCode,
  toAuthErrorBody,
} from '@/lib/auth/errors'

describe('mytester A-07 — บัญชีบริษัทไฟแนนซ์ที่ยังไม่ผูกบริษัท', () => {
  it('portalCompanyDenyCode: ไม่ผูกบริษัท ≠ บริษัทถูกระงับ', () => {
    expect(portalCompanyDenyCode(null, null)).toBe('USER_NOT_PROVISIONED')
    expect(portalCompanyDenyCode('c1', 'suspended')).toBe('COMPANY_SUSPENDED')
    expect(portalCompanyDenyCode('c1', null)).toBe('COMPANY_SUSPENDED')
    expect(portalCompanyDenyCode('c1', 'active')).toBeNull()
  })

  it('ข้อความบอกว่ายังไม่ผูกบริษัท ไม่ใช่ "ถูกระงับ"', () => {
    expect(COMPANY_NOT_LINKED_MESSAGE.title).toContain('ยังไม่ได้ผูกบริษัท')
    expect(COMPANY_NOT_LINKED_MESSAGE.message).toContain('ผู้ดูแลระบบ')
    expect(`${COMPANY_NOT_LINKED_MESSAGE.title}${COMPANY_NOT_LINKED_MESSAGE.message}`).not.toContain('ระงับ')
  })

  it('toAuthErrorBody ใช้ข้อความเฉพาะกรณีเมื่อส่งมา · ไม่ส่ง = ข้อความกลางของ code', () => {
    expect(toAuthErrorBody('USER_NOT_PROVISIONED', COMPANY_NOT_LINKED_MESSAGE).error).toEqual({
      code: 'USER_NOT_PROVISIONED',
      ...COMPANY_NOT_LINKED_MESSAGE,
    })
    expect(toAuthErrorBody('USER_NOT_PROVISIONED').error.title).toBe(authErrorMessage('USER_NOT_PROVISIONED').title)
  })

  it('loginReasonMessage: ?reason= ของหน้า login', () => {
    expect(loginReasonMessage(LOGIN_REASON_COMPANY_NOT_LINKED)).toEqual(COMPANY_NOT_LINKED_MESSAGE)
    expect(loginReasonMessage('COMPANY_SUSPENDED')).toEqual(authErrorMessage('COMPANY_SUSPENDED'))
    expect(loginReasonMessage('อะไรก็ได้')).toBeNull()
    expect(loginReasonMessage(undefined)).toBeNull()
  })
})
