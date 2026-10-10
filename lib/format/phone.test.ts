import { describe, expect, it } from 'vitest'
import { fmtThaiPhone } from '@/lib/format/phone'

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
