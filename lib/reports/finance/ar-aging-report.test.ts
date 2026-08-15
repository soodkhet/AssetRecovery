import { describe, expect, it } from 'vitest'
import {
  agingColumnTone,
  agingLowerBound,
  buildArAgingReport,
} from '@/lib/reports/finance/ar-aging-report'

/**
 * F3 (`96` §6-F3 · §13 "AR Aging bucket ตรงกับ due_date จริงของ BillingBatch")
 *
 * ⚠️ การจัดยอดลงช่วงเป็นของ `summarizeArAging()` (`22` §6.11 · มีเทสต์ของตัวเองที่
 * `lib/finance/ar-calc.test.ts`) — ที่นี่ตรวจ **คอลัมน์ตามค่าตั้ง + เกณฑ์สีเหลือง/แดง + KPI**
 */

const ASOF = new Date('2026-08-15T00:00:00.000Z')
const BUCKETS = [30, 60, 90]

function dueDaysAgo(days: number): Date {
  return new Date(ASOF.getTime() - days * 86_400_000)
}

function batch(days: number, totalSatang: number) {
  return { dueDate: dueDaysAgo(days), totalSatang, receivedSatang: 0, whtWithheldByCustomerSatang: 0 }
}

describe('F3 — คอลัมน์ช่วงอายุหนี้', () => {
  it('คอลัมน์มาจากค่าตั้งขององค์กร ไม่ใช่ 4 ช่องตายตัว', () => {
    const data = buildArAgingReport({ companies: [], buckets: [45, 90], asOf: ASOF })

    expect(data.columns.map((column) => column.header)).toEqual([
      'บริษัทไฟแนนซ์',
      'ยอดรวมค้าง',
      '0-45 วัน',
      '46-90 วัน',
      '90+ วัน',
      'จำนวนรอบวางบิล',
      'วันครบกำหนดล่าสุด',
    ])
  })

  it('เกิน 60 วัน = เหลือง · เกิน 90 วัน = แดง (ตัดสินจากขอบล่างของช่วง)', () => {
    expect(agingLowerBound(BUCKETS, 0)).toBe(0)
    expect(agingLowerBound(BUCKETS, 2)).toBe(61)
    expect(agingLowerBound(BUCKETS, 3)).toBe(91)

    expect(agingColumnTone(BUCKETS, 0)).toBe('default')
    expect(agingColumnTone(BUCKETS, 1)).toBe('default')
    expect(agingColumnTone(BUCKETS, 2)).toBe('warning')
    expect(agingColumnTone(BUCKETS, 3)).toBe('danger')
  })
})

describe('F3 — ยอดและ KPI', () => {
  const data = buildArAgingReport({
    companies: [
      {
        companyId: 'c1',
        companyName: 'ไฟแนนซ์ A',
        batches: [batch(14, 1_000_000), batch(45, 300_000), batch(120, 500_000)],
      },
      {
        companyId: 'c2',
        companyName: 'ไฟแนนซ์ B',
        // จ่ายครบแล้ว — ไม่ใช่ลูกหนี้ค้าง ต้องไม่อยู่ในรายงาน
        batches: [{ ...batch(70, 200_000), receivedSatang: 200_000 }],
      },
    ],
    buckets: BUCKETS,
    asOf: ASOF,
  })

  it('บริษัทที่ปิดยอดครบไม่อยู่ในรายงาน', () => {
    expect(data.rows.map((row) => row['company'])).toEqual(['ไฟแนนซ์ A'])
  })

  it('ยอดลงช่องตามอายุจริง และวันครบกำหนดล่าสุดเป็น ISO ให้ชั้นแสดงผลแปลงเป็น พ.ศ.', () => {
    expect(data.rows[0]).toMatchObject({
      outstandingSatang: 1_800_000,
      bucket0: 1_000_000,
      bucket1: 300_000,
      bucket2: 0,
      bucket3: 500_000,
      batchCount: 3,
      latestDueDate: '2026-08-01',
    })
  })

  it('KPI "เกิน 60/90 วัน" นับเฉพาะช่วงที่ขอบล่างเกินเกณฑ์', () => {
    const kpi = (key: string) => data.kpis?.find((item) => item.key === key)?.value

    expect(kpi('outstanding')).toBe(1_800_000)
    // 61-90 (0) + 90+ (500,000) — ช่วง 31-60 ยังไม่เกิน 60 วัน
    expect(kpi('over60')).toBe(500_000)
    expect(kpi('over90')).toBe(500_000)
    expect(kpi('companyCount')).toBe(1)
  })

  it('แถวรวมเท่ากับผลรวมของทุกบริษัท', () => {
    expect(data.totalRow).toMatchObject({
      company: 'รวมทั้งหมด',
      outstandingSatang: 1_800_000,
      bucket3: 500_000,
      batchCount: 3,
    })
  })

  it('WHT ที่ลูกค้าหักไว้ถือว่าชำระแล้ว — ไม่ค้างค้างตลอดกาล', () => {
    const withWht = buildArAgingReport({
      companies: [
        {
          companyId: 'c1',
          companyName: 'ไฟแนนซ์ A',
          batches: [
            { dueDate: dueDaysAgo(10), totalSatang: 1_070_000, receivedSatang: 1_040_000, whtWithheldByCustomerSatang: 30_000 },
          ],
        },
      ],
      buckets: BUCKETS,
      asOf: ASOF,
    })

    expect(withWht.rows).toEqual([])
    expect(withWht.kpis?.find((kpi) => kpi.key === 'outstanding')?.value).toBe(0)
  })
})
