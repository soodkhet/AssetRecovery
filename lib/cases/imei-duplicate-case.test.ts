import { describe, expect, it } from 'vitest'
import { activeCaseImeiWarningMessage } from '@/lib/cases/imei-duplicate-case'

describe('activeCaseImeiWarningMessage (มติชั่วคราว M1 B-03)', () => {
  it('ไม่มีเคสชน ⇒ null', () => {
    expect(activeCaseImeiWarningMessage([])).toBeNull()
  })

  it('บอกเลขเคส + ชื่อบริษัทเมื่อเป็นบริษัทอื่น · บริษัทเดียวกันไม่ต้องบอกชื่อ · รอบติดตาม > 1 แสดงรอบ', () => {
    const text = activeCaseImeiWarningMessage([
      { caseRef: 'A-1', trackingRound: 1, companyName: 'ไฟแนนซ์ ก', sameCompany: false },
      { caseRef: 'B-2', trackingRound: 2, companyName: 'ไฟแนนซ์ ข', sameCompany: true },
    ])
    expect(text).toContain('A-1 (ไฟแนนซ์ ก)')
    expect(text).toContain('B-2 รอบ 2')
    expect(text).not.toContain('ไฟแนนซ์ ข')
    expect(text).toContain('บันทึก/ส่งเคสได้')
  })

  it('เกิน 5 เคส ⇒ ย่อเป็น "และอีก n เคส"', () => {
    const hits = Array.from({ length: 7 }, (_, index) => ({
      caseRef: `C-${index}`,
      trackingRound: 1,
      companyName: 'X',
      sameCompany: true,
    }))
    const text = activeCaseImeiWarningMessage(hits)
    expect(text).toContain('C-4')
    expect(text).not.toContain('C-5')
    expect(text).toContain('และอีก 2 เคส')
  })
})
