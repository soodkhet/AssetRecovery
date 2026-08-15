import { describe, expect, it } from 'vitest'
import {
  buildRevenueSummary,
  revenuePerCaseSatang,
  type RevenueSummaryEntry,
} from '@/lib/reports/finance/revenue-summary-report'
import { ROW_KEY } from '@/lib/reports/payload'

/** F2 (`96` §6-F2) — จัดกลุ่ม + % สำเร็จ + MoM · เงินเป็นสตางค์จำนวนเต็มตลอดทาง */

function entry(overrides: Partial<RevenueSummaryEntry> & { groupKey: string }): RevenueSummaryEntry {
  return {
    groupLabel: overrides.groupKey,
    groupSort: overrides.groupKey,
    caseId: 'case-1',
    caseStatus: 'closed_success',
    revenueSatang: 100_000,
    ...overrides,
  }
}

describe('F2 — สรุปรายได้', () => {
  it('รายเดือน: เรียงตามเวลา และ MoM เทียบกับงวดก่อนหน้าในอนุกรม', () => {
    const data = buildRevenueSummary({
      groupBy: 'month',
      entries: [
        entry({ groupKey: '2026-07', groupLabel: 'กรกฎาคม 2569', groupSort: '2026-07-01', caseId: 'a', revenueSatang: 200_000 }),
        entry({ groupKey: '2026-08', groupLabel: 'สิงหาคม 2569', groupSort: '2026-08-01', caseId: 'b', revenueSatang: 300_000 }),
      ],
      previousEntries: [],
    })

    expect(data.rows.map((row) => row['group'])).toEqual(['กรกฎาคม 2569', 'สิงหาคม 2569'])
    // งวดแรกไม่มีฐานเทียบ (ช่วงก่อนหน้าว่าง) ⇒ N/A ไม่ใช่ 0%
    expect(data.rows[0]?.['changePct']).toBeNull()
    expect(data.rows[1]?.['changePct']).toBeCloseTo(50, 6)
  })

  it('รายเดือน: งวดแรกใช้งวดสุดท้ายของช่วงก่อนหน้าเป็นฐาน', () => {
    const data = buildRevenueSummary({
      groupBy: 'month',
      entries: [entry({ groupKey: '2026-08', groupSort: '2026-08-01', caseId: 'b', revenueSatang: 150_000 })],
      previousEntries: [entry({ groupKey: '2026-07', groupSort: '2026-07-01', caseId: 'a', revenueSatang: 100_000 })],
    })

    expect(data.rows[0]?.['changePct']).toBeCloseTo(50, 6)
  })

  it('รายบริษัท: MoM เทียบกับบริษัทเดียวกันในช่วงก่อนหน้า และเรียงตามรายได้', () => {
    const data = buildRevenueSummary({
      groupBy: 'company',
      entries: [
        entry({ groupKey: 'c1', groupLabel: 'ไฟแนนซ์ A', caseId: 'a', revenueSatang: 100_000 }),
        entry({ groupKey: 'c2', groupLabel: 'ไฟแนนซ์ B', caseId: 'b', revenueSatang: 400_000 }),
      ],
      previousEntries: [entry({ groupKey: 'c1', groupLabel: 'ไฟแนนซ์ A', caseId: 'z', revenueSatang: 200_000 })],
    })

    expect(data.rows.map((row) => row[ROW_KEY])).toEqual(['c2', 'c1'])
    expect(data.rows[1]?.['changePct']).toBeCloseTo(-50, 6)
    // บริษัทที่เพิ่งมีรายได้ครั้งแรก — เทียบไม่ได้
    expect(data.rows[0]?.['changePct']).toBeNull()
  })

  it('% สำเร็จ นับเฉพาะเคสที่ปิดแล้ว — เคสที่ยังไม่ปิดไม่เข้าตัวหาร', () => {
    const data = buildRevenueSummary({
      groupBy: 'company',
      entries: [
        entry({ groupKey: 'c1', caseId: 'a', caseStatus: 'closed_success' }),
        entry({ groupKey: 'c1', caseId: 'b', caseStatus: 'closed_fail' }),
        entry({ groupKey: 'c1', caseId: 'c', caseStatus: 'active' }),
      ],
      previousEntries: [],
    })

    expect(data.rows[0]).toMatchObject({ caseCount: 3, successCount: 1, failCount: 1 })
    expect(data.rows[0]?.['successPct']).toBeCloseTo(50, 6)
  })

  it('เคสเดียวมีรายได้หลายใบ (รีไซเกิล) นับเป็นเคสเดียว', () => {
    const data = buildRevenueSummary({
      groupBy: 'company',
      entries: [
        entry({ groupKey: 'c1', caseId: 'a', revenueSatang: 100_000 }),
        entry({ groupKey: 'c1', caseId: 'a', revenueSatang: 50_000 }),
      ],
      previousEntries: [],
    })

    expect(data.rows[0]).toMatchObject({ caseCount: 1, revenueSatang: 150_000, revenuePerCaseSatang: 150_000 })
  })

  it('รายได้ต่อเคส: ไม่มีเคส ⇒ null (ห้ามหารศูนย์) · มีเคส ⇒ ปัดเป็นสตางค์จำนวนเต็ม', () => {
    expect(revenuePerCaseSatang(100_000, 0)).toBeNull()
    expect(revenuePerCaseSatang(100_000, 3)).toBe(33_333)
  })

  it('KPI รวม + แถวรวม สอดคล้องกันและมี badge MoM', () => {
    const data = buildRevenueSummary({
      groupBy: 'company',
      entries: [
        entry({ groupKey: 'c1', caseId: 'a', revenueSatang: 300_000 }),
        entry({ groupKey: 'c2', caseId: 'b', revenueSatang: 100_000, caseStatus: 'closed_fail' }),
      ],
      previousEntries: [entry({ groupKey: 'c1', caseId: 'z', revenueSatang: 200_000 })],
    })

    expect(data.totalRow).toMatchObject({
      revenueSatang: 400_000,
      caseCount: 2,
      successCount: 1,
      failCount: 1,
      revenuePerCaseSatang: 200_000,
    })
    expect(data.kpis?.find((kpi) => kpi.key === 'revenue')?.mom?.changePct).toBeCloseTo(100, 6)
  })
})
