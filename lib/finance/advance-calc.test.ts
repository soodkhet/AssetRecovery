import { describe, expect, it } from 'vitest'
import { advanceReturnSatang, advanceSettlement } from '@/lib/finance/advance-calc'

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

describe('มติ PO 03/10/2569 (UAT Q3) — คืน = max(0, อนุมัติ − ใช้จริง) · ใช้เกิน = เบิกส่วนเกินอัตโนมัติ', () => {
  it('ADV1 (golden UAT): อนุมัติ ฿3,000 ใช้ ฿2,450 → คืน ฿550 ไม่มีส่วนเกิน', () => {
    expect(advanceSettlement({ requestedSatang: 300_000, approvedSatang: 300_000, usedSatang: 245_000 })).toEqual({
      returnSatang: 55_000,
      excessSatang: 0,
      needsExtraClaim: false,
    })
  })

  it('ใช้เท่ายอดอนุมัติพอดี → คืน 0 ไม่มีส่วนเกิน', () => {
    expect(advanceSettlement({ requestedSatang: 300_000, approvedSatang: 300_000, usedSatang: 300_000 })).toEqual({
      returnSatang: 0,
      excessSatang: 0,
      needsExtraClaim: false,
    })
  })

  it('ใช้เกินยอดที่ขอ (ADV-OVER ฿3,100 จาก ฿3,000) → ไม่ throw · คืน 0 · ส่วนเกิน ฿100 ต้องเบิกเพิ่ม', () => {
    expect(advanceSettlement({ requestedSatang: 300_000, approvedSatang: 300_000, usedSatang: 310_000 })).toEqual({
      returnSatang: 0,
      excessSatang: 10_000,
      needsExtraClaim: true,
    })
  })

  it('ส่วนเกินคิดจากยอดอนุมัติ (เงินที่ออกจริง) ไม่ใช่ยอดที่ขอ — อนุมัติ ฿2,000 จากที่ขอ ฿3,000 ใช้ ฿2,500 → เบิกเพิ่ม ฿500', () => {
    expect(advanceSettlement({ requestedSatang: 300_000, approvedSatang: 200_000, usedSatang: 250_000 })).toEqual({
      returnSatang: 0,
      excessSatang: 50_000,
      needsExtraClaim: true,
    })
  })
})
