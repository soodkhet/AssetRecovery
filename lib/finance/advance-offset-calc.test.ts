import { describe, expect, it } from 'vitest'
import {
  payeeRecoveryOutstandingSatang,
  advanceReturnOutstandingSatang,
  allocatePayeeAdvanceOffset,
  payoutTransferSatang,
} from '@/lib/finance/advance-offset-calc'

/** `22` §6.14 · มติ PO 05/10/2569 (UAT U30 · BUG-109) — ยอดคืนค้าง + หักกลบในรอบจ่าย */

describe('advanceReturnOutstandingSatang', () => {
  it('ยังไม่ได้คืน → ค้างเต็มยอด (ADV1 อนุมัติ ฿3,000 ใช้ ฿2,450 → ค้าง ฿550)', () => {
    expect(advanceReturnOutstandingSatang({ returnSatang: 55_000, collectedSatang: [] })).toBe(55_000)
  })

  it('คืนบางส่วนแล้ว → ค้างส่วนที่เหลือ · คืนครบ → 0', () => {
    expect(advanceReturnOutstandingSatang({ returnSatang: 55_000, collectedSatang: [30_000] })).toBe(25_000)
    expect(advanceReturnOutstandingSatang({ returnSatang: 55_000, collectedSatang: [30_000, 25_000] })).toBe(0)
  })

  it('ได้คืนเกินยอดคืน = ข้อมูลเพี้ยน ต้องดัง (ไม่ปัดเป็น 0)', () => {
    expect(() => advanceReturnOutstandingSatang({ returnSatang: 55_000, collectedSatang: [60_000] })).toThrow(RangeError)
  })

  it('ยอดไม่ใช่สตางค์จำนวนเต็ม/ติดลบ = ล้ม', () => {
    expect(() => advanceReturnOutstandingSatang({ returnSatang: 1.5, collectedSatang: [] })).toThrow(RangeError)
    expect(() => advanceReturnOutstandingSatang({ returnSatang: 100, collectedSatang: [-1] })).toThrow(RangeError)
  })
})

describe('allocatePayeeAdvanceOffset — หักหลัง WHT · ยอดโอนไม่ติดลบ · ยกยอด', () => {
  it('ยอดสุทธิพอ: คืนค้าง ฿550 รอบได้ ฿4,850 → หัก ฿550 โอน ฿4,300 ไม่มียกยอด', () => {
    const result = allocatePayeeAdvanceOffset([485_000], [{ advanceId: 'adv-1', outstandingSatang: 55_000 }])
    expect(result.allocations).toEqual([{ advanceId: 'adv-1', lineIndex: 0, amountSatang: 55_000 }])
    expect(result.lineOffsetSatang).toEqual([55_000])
    expect(result.lineTransferSatang).toEqual([430_000])
    expect(result.totalOffsetSatang).toBe(55_000)
    expect(result.carriedForward).toEqual([{ advanceId: 'adv-1', outstandingSatang: 0 }])
  })

  it('ยอดสุทธิไม่พอ (ตัวอย่างมติ U30): คืน ฿550 รอบได้ ฿300 → หัก ฿300 โอน ฿0 ยก ฿250', () => {
    const result = allocatePayeeAdvanceOffset([30_000], [{ advanceId: 'adv-1', outstandingSatang: 55_000 }])
    expect(result.lineOffsetSatang).toEqual([30_000])
    expect(result.lineTransferSatang).toEqual([0])
    expect(result.totalOffsetSatang).toBe(30_000)
    expect(result.carriedForward).toEqual([{ advanceId: 'adv-1', outstandingSatang: 25_000 }])
  })

  it('หลายบรรทัด: หักบรรทัดแรกจนหมดแล้วไหลไปบรรทัดถัดไป', () => {
    const result = allocatePayeeAdvanceOffset([20_000, 50_000], [{ advanceId: 'adv-1', outstandingSatang: 55_000 }])
    expect(result.allocations).toEqual([
      { advanceId: 'adv-1', lineIndex: 0, amountSatang: 20_000 },
      { advanceId: 'adv-1', lineIndex: 1, amountSatang: 35_000 },
    ])
    expect(result.lineTransferSatang).toEqual([0, 15_000])
  })

  it('หลายเงินทดรอง: หักตามลำดับที่เคลียร์ก่อน (FIFO) · ใบหลังได้ส่วนที่เหลือ แล้วยกยอดส่วนที่ไม่พอ', () => {
    const result = allocatePayeeAdvanceOffset(
      [40_000, 30_000],
      [
        { advanceId: 'adv-old', outstandingSatang: 50_000 },
        { advanceId: 'adv-new', outstandingSatang: 30_000 },
      ],
    )
    expect(result.allocations).toEqual([
      { advanceId: 'adv-old', lineIndex: 0, amountSatang: 40_000 },
      { advanceId: 'adv-old', lineIndex: 1, amountSatang: 10_000 },
      { advanceId: 'adv-new', lineIndex: 1, amountSatang: 20_000 },
    ])
    expect(result.totalOffsetSatang).toBe(70_000)
    expect(result.lineTransferSatang).toEqual([0, 0])
    expect(result.carriedForward).toEqual([
      { advanceId: 'adv-old', outstandingSatang: 0 },
      { advanceId: 'adv-new', outstandingSatang: 10_000 },
    ])
  })

  it('ยอดศูนย์: ไม่มีค้าง/ค้าง 0 → ไม่หัก ไม่มีแถว allocation · บรรทัดยอด 0 ถูกข้าม', () => {
    expect(allocatePayeeAdvanceOffset([10_000], []).totalOffsetSatang).toBe(0)
    const zero = allocatePayeeAdvanceOffset([10_000], [{ advanceId: 'adv-1', outstandingSatang: 0 }])
    expect(zero.allocations).toEqual([])
    expect(zero.lineTransferSatang).toEqual([10_000])
    const skip = allocatePayeeAdvanceOffset([0, 10_000], [{ advanceId: 'adv-1', outstandingSatang: 5_000 }])
    expect(skip.allocations).toEqual([{ advanceId: 'adv-1', lineIndex: 1, amountSatang: 5_000 }])
  })

  it('ไม่มีบรรทัดในรอบ → ยกยอดทั้งหมด', () => {
    const result = allocatePayeeAdvanceOffset([], [{ advanceId: 'adv-1', outstandingSatang: 55_000 }])
    expect(result.allocations).toEqual([])
    expect(result.carriedForward).toEqual([{ advanceId: 'adv-1', outstandingSatang: 55_000 }])
  })

  it('ยามข้อมูล: ยอดติดลบ/ทศนิยม/เงินทดรองซ้ำ = ล้ม', () => {
    expect(() => allocatePayeeAdvanceOffset([-1], [])).toThrow(RangeError)
    expect(() => allocatePayeeAdvanceOffset([100], [{ advanceId: 'a', outstandingSatang: 0.5 }])).toThrow(RangeError)
    expect(() =>
      allocatePayeeAdvanceOffset([100], [
        { advanceId: 'a', outstandingSatang: 1 },
        { advanceId: 'a', outstandingSatang: 1 },
      ]),
    ).toThrow(RangeError)
  })
})

describe('payoutTransferSatang', () => {
  it('net − ยอดหัก · หักเกิน net = ล้ม', () => {
    expect(payoutTransferSatang(485_000, 55_000)).toBe(430_000)
    expect(payoutTransferSatang(30_000, 30_000)).toBe(0)
    expect(() => payoutTransferSatang(30_000, 30_001)).toThrow(RangeError)
  })
})

describe('ยอดเรียกคืนจากผู้รับ (staging E-014)', () => {
  it('ยอดโอน = net − หักคืนเงินทดรอง − หักคืนยอดเรียกคืน · รวมเกิน net ⇒ ล้ม', () => {
    expect(payoutTransferSatang(100_000, 20_000, 30_000)).toBe(50_000)
    expect(payoutTransferSatang(100_000, 20_000)).toBe(80_000)
    expect(() => payoutTransferSatang(100_000, 60_000, 50_000)).toThrow(RangeError)
  })

  it('หักยอดเรียกคืนจากยอดที่เหลือหลังหักเงินทดรอง (FIFO) · ส่วนที่หักไม่หมดยกไปรอบถัดไป', () => {
    const result = allocatePayeeAdvanceOffset([30_000, 10_000], [
      { advanceId: 'rec-1', outstandingSatang: 25_000 },
      { advanceId: 'rec-2', outstandingSatang: 20_000 },
    ])
    expect(result.totalOffsetSatang).toBe(40_000)
    expect(result.carriedForward).toEqual([
      { advanceId: 'rec-1', outstandingSatang: 0 },
      { advanceId: 'rec-2', outstandingSatang: 5_000 },
    ])
    expect(payeeRecoveryOutstandingSatang({ amountSatang: 50_000, collectedSatang: [20_000, 5_000] })).toBe(25_000)
  })
})
