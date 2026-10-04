import { describe, expect, it } from 'vitest'
import { withContextSuffix } from '@/lib/api/types'

describe('withContextSuffix — ต่อท้ายรายชื่อจากข้อมูลประกอบของ error', () => {
  it('companies (TEMPLATE_IN_USE) ต่อท้ายเหมือนเดิม', () => {
    expect(withContextSuffix('ใช้อยู่', { companies: ['A', 'B'] })).toBe('ใช้อยู่ (A, B)')
  })

  it('payees (UNVERIFIED_PAYEE_IN_PAYOUT) บอกชื่อผู้รับที่ยังไม่ยืนยัน (BUG-110)', () => {
    expect(withContextSuffix('มีผู้รับที่ยังไม่ยืนยัน', { payees: ['นาย ก', 'นาง ข'] })).toBe(
      'มีผู้รับที่ยังไม่ยืนยัน (นาย ก, นาง ข)',
    )
  })

  it('รายการที่ไม่ใช่ string (object) หรือว่าง → ไม่ต่อท้าย', () => {
    expect(withContextSuffix('m', { payees: [{ payeeName: 'x' }] })).toBe('m')
    expect(withContextSuffix('m', { payees: [] })).toBe('m')
    expect(withContextSuffix('m', {})).toBe('m')
  })
})
