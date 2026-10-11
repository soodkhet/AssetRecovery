import { describe, expect, it } from 'vitest'
import { fmtThaiPhone, isThaiPhone } from '@/lib/format/phone'

describe('fmtThaiPhone (staging E-023)', () => {
  it('มือถือ / กรุงเทพฯ / ต่างจังหวัด', () => {
    expect(fmtThaiPhone('0812345678')).toBe('081-234-5678')
    expect(fmtThaiPhone('022345678')).toBe('02-234-5678')
    expect(fmtThaiPhone('053123456')).toBe('053-123-456')
  })
  it('รูปแบบอื่นคืนค่าเดิม', () => {
    expect(fmtThaiPhone('02-234-5678 ต่อ 12')).toBe('02-234-5678 ต่อ 12')
    expect(fmtThaiPhone(null)).toBe('')
  })
})

describe('isThaiPhone (mytester A-04)', () => {
  it('รับเบอร์บ้าน/มือถือ/+66/เบอร์ต่อ', () => {
    expect(isThaiPhone('02-111-2233')).toBe(true)
    expect(isThaiPhone('0812345678')).toBe(true)
    expect(isThaiPhone('053 123 456')).toBe(true)
    expect(isThaiPhone('+66 2 111 2233')).toBe(true)
    expect(isThaiPhone('(02) 111-2233')).toBe(true)
    expect(isThaiPhone('02-111-2233 ต่อ 12')).toBe(true)
    expect(isThaiPhone('02-111-2233 ext. 105')).toBe(true)
  })
  it('ปฏิเสธเบอร์สั้น/ยาว/มีตัวอักษร/ไม่ขึ้นต้น 0', () => {
    expect(isThaiPhone('12')).toBe(false)
    expect(isThaiPhone('02-111-22')).toBe(false)
    expect(isThaiPhone('081234567890')).toBe(false)
    expect(isThaiPhone('02-111-abcd')).toBe(false)
    expect(isThaiPhone('212345678')).toBe(false)
    expect(isThaiPhone('')).toBe(false)
    expect(isThaiPhone(null)).toBe(false)
  })
})
