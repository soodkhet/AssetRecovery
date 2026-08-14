import { describe, expect, it } from 'vitest'
import { loginSchema, PASSWORD_MIN_LENGTH, setPasswordSchema } from '@/lib/auth/schemas'

/** schema เดียวใช้ร่วม FE/BE (Rule 04) */

describe('loginSchema', () => {
  it('อีเมลถูก normalize เป็นตัวพิมพ์เล็ก', () => {
    expect(loginSchema.parse({ email: ' Somchai@Example.COM ', password: 'x' }).email).toBe(
      'somchai@example.com',
    )
  })
})

describe('setPasswordSchema (ตั้งรหัสผ่านครั้งแรกจากลิงก์คำเชิญ — D1)', () => {
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
