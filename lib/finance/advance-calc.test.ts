import { describe, expect, it } from 'vitest'
import { advanceReturnSatang, advanceSettlement, assertSettlementAllowed } from '@/lib/finance/advance-calc'
import { isFinanceError } from '@/lib/finance/errors'

/** `22` §6.13 · `15` §16 — ยอดคืนเงินทดรองจ่าย (ห้ามติดลบ) */

describe('advanceReturnSatang — มิเรอร์ generated column ของ `02` §5', () => {
  it('เคลียร์ยอดมีเงินคืน: อนุมัติ ฿5,000 ใช้ ฿4,200 → คืน ฿800 (`15` §16)', () => {
    expect(advanceReturnSatang({ approvedSatang: 500_000, usedSatang: 420_000 })).toBe(80_000)
  })

  it('ใช้เกินยอดอนุมัติ → คืน 0 **ห้ามติดลบ** (Rule 01)', () => {
    expect(advanceReturnSatang({ approvedSatang: 500_000, usedSatang: 550_000 })).toBe(0)
  })

  it('ใช้พอดี → คืน 0', () => {
    expect(advanceReturnSatang({ approvedSatang: 500_000, usedSatang: 500_000 })).toBe(0)
  })

  it('ยังไม่อนุมัติ (null) → ถือว่ายังไม่มีเงินออก คืน 0', () => {
    expect(advanceReturnSatang({ approvedSatang: null, usedSatang: 0 })).toBe(0)
    expect(advanceReturnSatang({ approvedSatang: null, usedSatang: 100_000 })).toBe(0)
  })

  it('ยอดติดลบ/ไม่ใช่จำนวนเต็ม = ล้ม', () => {
    expect(() => advanceReturnSatang({ approvedSatang: -1, usedSatang: 0 })).toThrow(RangeError)
    expect(() => advanceReturnSatang({ approvedSatang: 100, usedSatang: 0.5 })).toThrow(RangeError)
  })
})

describe('advanceSettlement — ยอดคืน + ส่วนเกินสำหรับหน้าเคลียร์ยอด', () => {
  it('ใช้น้อยกว่าที่อนุมัติ → คืนเงิน ไม่มีส่วนเกิน', () => {
    expect(advanceSettlement({ requestedSatang: 500_000, approvedSatang: 500_000, usedSatang: 420_000 })).toEqual({
      returnSatang: 80_000,
      excessSatang: 0,
      needsExtraClaim: false,
    })
  })

  it('เคลียร์ยอดใช้เกิน: ขอ/อนุมัติ ฿5,000 ใช้ ฿5,500 → ส่วนเกิน ฿500 ต้องเบิกใหม่ (`15` §16)', () => {
    expect(advanceSettlement({ requestedSatang: 500_000, approvedSatang: 500_000, usedSatang: 550_000 })).toEqual({
      returnSatang: 0,
      excessSatang: 50_000,
      needsExtraClaim: true,
    })
  })

  it('อนุมัติน้อยกว่าที่ขอ → คิดจากยอดที่อนุมัติจริง (เงินที่ออกไปจริง)', () => {
    expect(advanceSettlement({ requestedSatang: 500_000, approvedSatang: 300_000, usedSatang: 280_000 })).toEqual({
      returnSatang: 20_000,
      excessSatang: 0,
      needsExtraClaim: false,
    })
  })
})

describe('assertSettlementAllowed — `USED_EXCEEDS_REQUEST_NO_TOPUP` (`24` §6.4)', () => {
  it('ใช้ไม่เกินยอดที่ขอ → ผ่าน', () => {
    expect(() => assertSettlementAllowed({ requestedSatang: 500_000, usedSatang: 500_000 })).not.toThrow()
  })

  it('ใช้เกินยอดที่ขอ → reject พร้อม code จากทะเบียน', () => {
    try {
      assertSettlementAllowed({ requestedSatang: 500_000, usedSatang: 550_000 })
      expect.unreachable('ต้องโยน USED_EXCEEDS_REQUEST_NO_TOPUP')
    } catch (error) {
      expect(isFinanceError(error)).toBe(true)
      if (isFinanceError(error)) {
        expect(error.code).toBe('USED_EXCEEDS_REQUEST_NO_TOPUP')
        expect(error.status).toBe(400)
      }
    }
  })
})
