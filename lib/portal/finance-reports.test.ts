import { describe, expect, it } from 'vitest'
import { summarizeArAging, type ArAgingRow } from '@/lib/finance/ar-calc'
import { portalRevenueSummaryQuerySchema } from '@/lib/portal/finance-schemas'
import { portalRevenueMonths } from '@/lib/portal/report-range'
import { serializePortalArAging, serializePortalRevenueSummary } from '@/lib/portal/serializers'
import { buildArAgingReport } from '@/lib/reports/finance/ar-aging-report'
import { buildRevenueSummary, type RevenueSummaryEntry } from '@/lib/reports/finance/revenue-summary-report'

/**
 * ชั้น pure ของรายงานการเงินในพอร์ทัล (Portal-P5 · `97` §6.5 · มติ O43 D9) — ตัวเลขมาจาก builder ภายใน
 * ตัวเดิม (F2/F3) · serializer แค่คัดฟิลด์ (whitelist) + เติมเดือนที่ไม่มีรายได้
 */

describe('portalRevenueMonths', () => {
  it('6 เดือนย้อนหลังข้ามปี · ป้าย พ.ศ. · เรียงเก่า → ใหม่', () => {
    const { months, range } = portalRevenueMonths(6, new Date('2026-02-10T05:00:00Z'))
    expect(months.map((month) => month.key)).toEqual([
      '2025-09-01',
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ])
    expect(months[0]?.label).toBe('กันยายน 2568')
    expect(months.at(-1)?.label).toBe('กุมภาพันธ์ 2569')
    expect(range.startDate.toISOString().slice(0, 10)).toBe('2025-09-01')
    expect(range.endDate.toISOString().slice(0, 10)).toBe('2026-02-28')
  })

  it('อิงปฏิทินไทย — 28 ก.พ. 18:00 UTC = 1 มี.ค. ไทย ⇒ เดือนปัจจุบันคือมีนาคม', () => {
    const { months } = portalRevenueMonths(1, new Date('2026-02-28T18:00:00Z'))
    expect(months).toEqual([{ key: '2026-03-01', label: 'มีนาคม 2569' }])
  })

  it('จำนวนเดือนไม่ถูกต้อง ⇒ RangeError', () => {
    expect(() => portalRevenueMonths(0, new Date())).toThrow(RangeError)
  })
})

describe('portalRevenueSummaryQuerySchema', () => {
  it('ค่าเริ่มต้น 6 · รับ 1–12 · นอกช่วง/ไม่ใช่จำนวนเต็ม = ไม่ผ่าน', () => {
    expect(portalRevenueSummaryQuerySchema.parse({}).months).toBe(6)
    expect(portalRevenueSummaryQuerySchema.parse({ months: '12' }).months).toBe(12)
    expect(portalRevenueSummaryQuerySchema.safeParse({ months: '0' }).success).toBe(false)
    expect(portalRevenueSummaryQuerySchema.safeParse({ months: '13' }).success).toBe(false)
    expect(portalRevenueSummaryQuerySchema.safeParse({ months: '2.5' }).success).toBe(false)
  })
})

describe('serializePortalRevenueSummary', () => {
  const entry = (groupKey: string, caseId: string, caseStatus: string, revenueSatang: number): RevenueSummaryEntry => ({
    groupKey,
    groupLabel: groupKey,
    groupSort: groupKey,
    caseId,
    caseStatus,
    revenueSatang,
  })

  it('ใช้ตัวเลขจาก buildRevenueSummary · เติมเดือนว่างเป็น 0 · ไม่ส่งคอลัมน์/คีย์ภายใน', () => {
    const { months, range } = portalRevenueMonths(3, new Date('2026-08-15T05:00:00Z'))
    const report = buildRevenueSummary({
      groupBy: 'month',
      entries: [
        entry('2026-08-01', 'c1', 'closed_success', 1_000_000),
        entry('2026-08-01', 'c1', 'closed_success', 200_000),
        entry('2026-08-01', 'c2', 'closed_fail', 300_000),
        entry('2026-06-01', 'c3', 'active', 100_000),
      ],
      previousEntries: [],
    })
    const dto = serializePortalRevenueSummary({ report, months, rangeStart: range.startDate, rangeEnd: range.endDate })

    expect(dto.rangeStart).toBe('2026-06-01')
    expect(dto.rangeEnd).toBe('2026-08-31')
    expect(dto.months.map((month) => month.revenueSatang)).toEqual([100_000, 0, 1_500_000])
    expect(dto.months[1]).toMatchObject({ month: '2026-07-01', caseCount: 0, successPct: null, revenuePerCaseSatang: null })
    // เคสเดียวที่มีรายได้หลายใบนับเป็น 1 เคส · ต่อเคส = 1,500,000 / 2
    expect(dto.months[2]).toMatchObject({ caseCount: 2, successCount: 1, failCount: 1, revenuePerCaseSatang: 750_000 })
    expect(dto.total).toMatchObject({ revenueSatang: 1_600_000, caseCount: 3, successCount: 1, failCount: 1 })
    expect(JSON.stringify(dto)).not.toContain('__key')
    expect(Object.keys(dto).sort()).toEqual(['months', 'rangeEnd', 'rangeStart', 'total'])
  })
})

describe('serializePortalArAging', () => {
  const asOf = new Date('2026-08-15T00:00:00Z')
  const batch = (dueDate: string, totalSatang: number, receivedSatang = 0, whtWithheldByCustomerSatang = 0): ArAgingRow => ({
    dueDate: new Date(`${dueDate}T00:00:00Z`),
    totalSatang,
    receivedSatang,
    whtWithheldByCustomerSatang,
    bankFeeWrittenOffSatang: 0,
  })

  it('ช่วง/ยอดเท่ากับ summarizeArAging (สูตรกลาง) · WHT ที่ลูกค้าหักถือว่าชำระแล้ว · ไม่มีชื่อบริษัท', () => {
    const batches = [
      batch('2026-08-20', 100_000), // ยังไม่ถึงกำหนด → ช่วงแรก
      batch('2026-07-01', 214_000, 100_000, 6_000), // 45 วัน → 31-60 ค้าง 108,000
      batch('2026-05-01', 50_000), // 106 วัน → 90+
      batch('2026-04-01', 53_500, 52_000, 1_500), // ชำระครบรวม WHT → ไม่นับ
    ]
    const report = buildArAgingReport({
      companies: [{ companyId: 'co-1', companyName: 'ไฟแนนซ์หนึ่ง', batches }],
      buckets: [30, 60, 90],
      asOf,
    })
    const dto = serializePortalArAging(report, asOf)
    const expected = summarizeArAging(batches, [30, 60, 90], asOf)

    expect(dto.asOf).toBe('2026-08-15')
    expect(dto.buckets.map((bucket) => bucket.label)).toEqual(expected.map((bucket) => bucket.label))
    expect(dto.buckets.map((bucket) => bucket.outstandingSatang)).toEqual(expected.map((bucket) => bucket.outstandingSatang))
    expect(dto.buckets.map((bucket) => bucket.tone)).toEqual(['default', 'default', 'warning', 'danger'])
    expect(dto.totalOutstandingSatang).toBe(258_000)
    expect(dto.over60Satang).toBe(50_000)
    expect(dto.over90Satang).toBe(50_000)
    expect(dto.batchCount).toBe(3)
    expect(JSON.stringify(dto)).not.toContain('ไฟแนนซ์หนึ่ง')
    expect(JSON.stringify(dto)).not.toContain('co-1')
  })

  it('ไม่มีบิลค้าง ⇒ ยอด 0 ทุกช่วง (ช่วงยังครบตามค่าตั้ง)', () => {
    const dto = serializePortalArAging(buildArAgingReport({ companies: [], buckets: [30, 60, 90], asOf }), asOf)
    expect(dto.totalOutstandingSatang).toBe(0)
    expect(dto.buckets).toHaveLength(4)
    expect(dto.buckets.every((bucket) => bucket.outstandingSatang === 0)).toBe(true)
  })
})
