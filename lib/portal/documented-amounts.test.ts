import { describe, expect, it } from 'vitest'
import {
  allocateDocumentedRevenue,
  allocateRevenueAfterCreditNotes,
  applyCreditNotes,
  uninvoicedReductionRevenueNotes,
  ZERO_AMOUNTS,
} from '@/lib/portal/documented-amounts'
import { UNINVOICED_REDUCTION_WAIVE_REASON } from '@/lib/sales/uninvoiced-reduction'

describe('applyCreditNotes (มติ U14 — ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้)', () => {
  const invoiced = { beforeVatSatang: 37_300_000, vatSatang: 2_611_000, totalSatang: 39_911_000 }

  it('ยังไม่มีใบลดหนี้ ⇒ ยอดหน้าใบกำกับเดิม (CO1 399,110)', () => {
    expect(applyCreditNotes(invoiced, ZERO_AMOUNTS)).toEqual(invoiced)
  })

  it('มีใบลดหนี้ ⇒ หักทีละช่อง', () => {
    expect(applyCreditNotes(invoiced, { beforeVatSatang: 1_000_000, vatSatang: 70_000, totalSatang: 1_070_000 })).toEqual({
      beforeVatSatang: 36_300_000,
      vatSatang: 2_541_000,
      totalSatang: 38_841_000,
    })
  })
})

describe('allocateDocumentedRevenue — กระจายยอดก่อน VAT ตามเอกสารลงรายได้ในรอบ', () => {
  it('ยอดเอกสาร = ผลรวม gross ⇒ ได้ gross เดิมทุกใบ (กราฟ = ยอดหน้าใบกำกับ)', () => {
    const map = allocateDocumentedRevenue(37_300_000, [
      { id: 'a', grossSatang: 30_000_000 },
      { id: 'b', grossSatang: 7_300_000 },
    ])
    expect(map.get('a')).toBe(30_000_000)
    expect(map.get('b')).toBe(7_300_000)
  })

  it('ยอดเอกสารลดลง ⇒ กระจายตามสัดส่วน ผลรวมเท่ายอดเอกสารเสมอ (ไม่หายเศษสตางค์)', () => {
    const map = allocateDocumentedRevenue(100, [
      { id: 'a', grossSatang: 1 },
      { id: 'b', grossSatang: 1 },
      { id: 'c', grossSatang: 1 },
    ])
    expect([...map.values()].reduce((sum, value) => sum + value, 0)).toBe(100)
    expect([...map.values()].sort()).toEqual([33, 33, 34])
  })

  it('gross รวมเป็น 0 / ไม่มีรายได้ ⇒ 0 ไม่หารศูนย์', () => {
    expect(allocateDocumentedRevenue(500, [{ id: 'a', grossSatang: 0 }]).get('a')).toBe(0)
    expect(allocateDocumentedRevenue(500, []).size).toBe(0)
  })
})

describe('allocateRevenueAfterCreditNotes — หักใบลดหนี้ในกราฟรายได้ (มติ U14 · fixer X3)', () => {
  const revenues = [
    { id: 'a', grossSatang: 30_000 },
    { id: 'b', grossSatang: 70_000 },
  ]
  const sum = (map: Map<string, number>): number => [...map.values()].reduce((total, value) => total + value, 0)

  it('ไม่มีใบลดหนี้ ⇒ เท่ากับยอดหน้าใบกำกับที่กระจายแล้ว', () => {
    expect(allocateRevenueAfterCreditNotes(100_000, revenues, [])).toEqual(allocateDocumentedRevenue(100_000, revenues))
  })

  it('ใบลดหนี้ผูก Adjustment → รายได้ใบหนึ่ง ⇒ หักตรงใบนั้นทั้งก้อน ใบอื่นไม่ลด', () => {
    const map = allocateRevenueAfterCreditNotes(100_000, revenues, [{ amountBeforeVatSatang: 10_000, revenueId: 'a' }])
    expect(map.get('a')).toBe(20_000)
    expect(map.get('b')).toBe(70_000)
  })

  it('ใบลดหนี้ไม่ผูกรายได้ (หรือผูกรายได้นอกรอบ) ⇒ กระจายตามสัดส่วน · ผลรวม = ใบกำกับ − ใบลดหนี้', () => {
    const map = allocateRevenueAfterCreditNotes(100_000, revenues, [
      { amountBeforeVatSatang: 10_001, revenueId: null },
      { amountBeforeVatSatang: 5, revenueId: 'not-in-batch' },
    ])
    expect(sum(map)).toBe(100_000 - 10_006)
    expect(map.get('a')).toBe(30_000 - 3_002)
    expect(map.get('b')).toBe(70_000 - 7_004)
  })

  it('ผูกตรงแต่เกินยอดคงเหลือของใบ ⇒ ใบนั้นเหลือ 0 ส่วนเกินกระจายใบอื่น (ไม่ติดลบ)', () => {
    const map = allocateRevenueAfterCreditNotes(100_000, revenues, [{ amountBeforeVatSatang: 40_000, revenueId: 'a' }])
    expect(map.get('a')).toBe(0)
    expect(map.get('b')).toBe(60_000)
  })

  it('ผสมผูกตรง + กระจาย · deterministic (เรียกซ้ำได้ผลเดิม)', () => {
    const notes = [
      { amountBeforeVatSatang: 10_000, revenueId: 'b' },
      { amountBeforeVatSatang: 9_000, revenueId: null },
    ]
    const first = allocateRevenueAfterCreditNotes(100_000, revenues, notes)
    // หลังหักตรง: a 30,000 · b 60,000 ⇒ 9,000 กระจาย 1:2
    expect(first.get('a')).toBe(27_000)
    expect(first.get('b')).toBe(54_000)
    expect(allocateRevenueAfterCreditNotes(100_000, revenues, notes)).toEqual(first)
  })
})

describe('uninvoicedReductionRevenueNotes — mytester3 V3-01 ส่วนที่ลดแบบไม่ต้องออกใบลดหนี้ในกราฟรายได้', () => {
  it('R = 0 ⇒ ไม่มีรายการหัก', () => {
    expect(uninvoicedReductionRevenueNotes(0, [{ amountSatang: 5_000, revenueId: 'a', creditNoteWaiveReason: null }])).toEqual([])
  })

  it('ผูก Adjustment ระดับรายได้ ⇒ หักตรงใบนั้น (ป้าย "ไม่ต้องออกใบลดหนี้" ก่อน) · ไม่เกินยอดรายการ · ผลรวม = R', () => {
    const notes = uninvoicedReductionRevenueNotes(12_000, [
      { amountSatang: 10_000, revenueId: 'b', creditNoteWaiveReason: null },
      { amountSatang: 5_000, revenueId: 'a', creditNoteWaiveReason: UNINVOICED_REDUCTION_WAIVE_REASON },
    ])
    expect(notes).toEqual([
      { amountBeforeVatSatang: 5_000, revenueId: 'a', noteType: 'credit' },
      { amountBeforeVatSatang: 7_000, revenueId: 'b', noteType: 'credit' },
    ])
  })

  it('ระดับรอบ / R เกินผลรวมรายการ ⇒ ก้อนไม่ผูก', () => {
    expect(
      uninvoicedReductionRevenueNotes(9_000, [
        { amountSatang: 3_000, revenueId: null, creditNoteWaiveReason: null },
        { amountSatang: 2_000, revenueId: 'a', creditNoteWaiveReason: null },
      ]),
    ).toEqual([
      { amountBeforeVatSatang: 3_000, revenueId: null, noteType: 'credit' },
      { amountBeforeVatSatang: 2_000, revenueId: 'a', noteType: 'credit' },
      { amountBeforeVatSatang: 4_000, revenueId: null, noteType: 'credit' },
    ])
  })

  it('รวมกับ allocateRevenueAfterCreditNotes ⇒ หักตรงรายได้ของเคส · ผลรวม = ยอดใบแจ้งหนี้ − R (SPC ต.ค. 5,303.45 → 5,253.45)', () => {
    const revenues = [
      { id: 'spc05', grossSatang: 480_218 },
      { id: 'spc06', grossSatang: 50_127 },
    ]
    const map = allocateRevenueAfterCreditNotes(
      530_345,
      revenues,
      uninvoicedReductionRevenueNotes(5_000, [
        { amountSatang: 5_000, revenueId: 'spc06', creditNoteWaiveReason: UNINVOICED_REDUCTION_WAIVE_REASON },
      ]),
    )
    expect(map.get('spc05')).toBe(480_218)
    expect(map.get('spc06')).toBe(45_127)
    expect([...map.values()].reduce((sum, value) => sum + value, 0)).toBe(525_345)
  })
})
