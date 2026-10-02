import { describe, expect, it } from 'vitest'
import { changePasswordSchema, loginSchema, PASSWORD_MIN_LENGTH, setPasswordSchema } from '@/lib/auth/schemas'

/** schema เดียวใช้ร่วม FE/BE (Rule 04) */

describe('loginSchema', () => {
  it('ช่องเดียวรับทั้งอีเมลและ username — normalize เป็นตัวพิมพ์เล็ก', () => {
    expect(loginSchema.parse({ identifier: ' Somchai@Example.COM ', password: 'x' }).identifier).toBe(
      'somchai@example.com',
    )
    expect(loginSchema.parse({ identifier: 'Agent01', password: 'x' }).identifier).toBe('agent01')
  })

  it('ว่างถูกปฏิเสธ', () => {
    expect(loginSchema.safeParse({ identifier: '  ', password: 'x' }).success).toBe(false)
  })
})

describe('setPasswordSchema (ผู้ใช้เปลี่ยนรหัสของตัวเอง)', () => {
  const good = { password: 'assetrecovery1', confirmPassword: 'assetrecovery1' }

  it('รหัสผ่านที่ผ่านเงื่อนไขครบ', () => {
    expect(setPasswordSchema.safeParse(good).success).toBe(true)
  })

  it(`สั้นกว่า ${PASSWORD_MIN_LENGTH} ตัวถูกปฏิเสธ`, () => {
    expect(setPasswordSchema.safeParse({ password: 'ab1', confirmPassword: 'ab1' }).success).toBe(false)
  })

  it('ต้องมีทั้งตัวอักษรและตัวเลข', () => {
    expect(setPasswordSchema.safeParse({ password: '12345678', confirmPassword: '12345678' }).success).toBe(false)
    expect(setPasswordSchema.safeParse({ password: 'abcdefgh', confirmPassword: 'abcdefgh' }).success).toBe(false)
  })

  it('ยืนยันรหัสผ่านไม่ตรง → error ลงที่ช่อง confirmPassword', () => {
    const result = setPasswordSchema.safeParse({ ...good, confirmPassword: 'assetrecovery2' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword'])
  })
})

describe('changePasswordSchema (DEC-010)', () => {
  const good = { currentPassword: 'temp1234', password: 'assetrecovery1', confirmPassword: 'assetrecovery1' }

  it('ต้องกรอกรหัสปัจจุบันเสมอ', () => {
    expect(changePasswordSchema.safeParse(good).success).toBe(true)
    expect(changePasswordSchema.safeParse({ ...good, currentPassword: '' }).success).toBe(false)
  })

  it('รหัสใหม่ห้ามซ้ำรหัสปัจจุบัน', () => {
    const same = changePasswordSchema.safeParse({ currentPassword: 'temp1234', password: 'temp1234', confirmPassword: 'temp1234' })
    expect(same.success).toBe(false)
    expect(same.error?.issues[0]?.path).toEqual(['password'])
  })
})
