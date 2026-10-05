import { describe, expect, it } from 'vitest'
import {
  allocateDocumentedRevenue,
  allocateRevenueAfterCreditNotes,
  applyCreditNotes,
  ZERO_AMOUNTS,
} from '@/lib/portal/documented-amounts'

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
