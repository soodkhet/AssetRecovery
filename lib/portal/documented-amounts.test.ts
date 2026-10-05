import { describe, expect, it } from 'vitest'
import { allocateDocumentedRevenue, applyCreditNotes, ZERO_AMOUNTS } from '@/lib/portal/documented-amounts'

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
