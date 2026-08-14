import { describe, expect, it } from 'vitest'
import {
  buildInviteRedirectUrl,
  inviteSucceeded,
  inviteWarning,
  isEmailAlreadyRegistered,
  SET_PASSWORD_PATH,
  type InviteOutcome,
} from '@/lib/users/invite'

/** flow เชิญ/ตั้งรหัสผ่านครั้งแรก — มติ PO ปิด open item D1 (`inviteUserByEmail`) */

const success: InviteOutcome = { uid: 'uid-1', emailSent: true, linkedExisting: false, failureMessage: null }

describe('buildInviteRedirectUrl', () => {
  it('ชี้ไปหน้าตั้งรหัสผ่านของ origin ที่เรียกเข้ามา (ไม่ต้องมี env เพิ่ม)', () => {
    expect(buildInviteRedirectUrl('https://staging.example.com')).toBe(
      `https://staging.example.com${SET_PASSWORD_PATH}`,
    )
    expect(buildInviteRedirectUrl('http://localhost:3000')).toBe(`http://localhost:3000${SET_PASSWORD_PATH}`)
  })
})

describe('isEmailAlreadyRegistered', () => {
  it('จับได้ทั้งจาก code และข้อความของ gotrue หลายเวอร์ชัน', () => {
    expect(isEmailAlreadyRegistered({ code: 'email_exists' })).toBe(true)
    expect(isEmailAlreadyRegistered({ code: 'user_already_exists' })).toBe(true)
    expect(isEmailAlreadyRegistered({ message: 'A user with this email address has already been registered' })).toBe(
      true,
    )
  })

  it('error อื่นไม่ถูกตีความว่าอีเมลซ้ำ', () => {
    expect(isEmailAlreadyRegistered({ code: 'over_email_send_rate_limit' })).toBe(false)
    expect(isEmailAlreadyRegistered({ message: 'SMTP connection failed' })).toBe(false)
    expect(isEmailAlreadyRegistered(null)).toBe(false)
  })
})

describe('inviteWarning', () => {
  it('เชิญสำเร็จตามปกติ = ไม่มี warning', () => {
    expect(inviteSucceeded(success)).toBe(true)
    expect(inviteWarning(success)).toBeNull()
  })

  it('ผูกไม่สำเร็จ → เตือนว่าผู้ใช้ยัง login ไม่ได้ พร้อมสาเหตุ', () => {
    const warning = inviteWarning({
      uid: null,
      emailSent: false,
      linkedExisting: false,
      failureMessage: 'SMTP not configured',
    })
    expect(warning?.code).toBe('USER_NOT_PROVISIONED')
    expect(warning?.message).toContain('SMTP not configured')
  })

  it('ผูกกับบัญชี Auth เดิม → เตือนว่าไม่ได้ส่งอีเมลใหม่', () => {
    const warning = inviteWarning({ uid: 'uid-2', emailSent: false, linkedExisting: true, failureMessage: null })
    expect(warning?.code).toBe('USER_LINKED_EXISTING_AUTH')
  })
})
