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

  describe('U55 — เคสปิดไม่สำเร็จเข้าตัวหาร % สำเร็จ', () => {
    it('ตัวอย่าง CO2: สำเร็จ 1 (มีรายได้) + closed_fail 1 = 50% · เคสทั้งหมด/รายได้ต่อเคสคิดจากเคสที่มีรายได้', () => {
      const data = buildRevenueSummary({
        groupBy: 'company',
        entries: [
          entry({ groupKey: 'co1', groupLabel: 'CO1', caseId: 'a1', revenueSatang: 124_000 }),
          entry({ groupKey: 'co1', groupLabel: 'CO1', caseId: 'a2', revenueSatang: 124_000 }),
          entry({ groupKey: 'co1', groupLabel: 'CO1', caseId: 'a3', revenueSatang: 125_000 }),
          entry({ groupKey: 'co2', groupLabel: 'CO2', caseId: 'b1', revenueSatang: 700_000 }),
        ],
        previousEntries: [],
        failCases: [{ groupKey: 'co2', groupLabel: 'CO2', groupSort: 'CO2', caseId: 'b2' }],
      })
      const co2 = data.rows.find((row) => row[ROW_KEY] === 'co2')
      expect(co2).toMatchObject({ caseCount: 1, successCount: 1, failCount: 1, successPct: 50, revenuePerCaseSatang: 700_000 })
      expect(data.rows.find((row) => row[ROW_KEY] === 'co1')).toMatchObject({ successPct: 100, revenuePerCaseSatang: 124_333 })
      expect(data.totalRow).toMatchObject({ caseCount: 4, successCount: 4, failCount: 1, successPct: 80, revenuePerCaseSatang: 268_250 })
      expect(data.kpis?.find((kpi) => kpi.key === 'caseCount')?.hint).toContain('ไม่สำเร็จ 1')
    })

    it('กลุ่มที่มีแต่เคสไม่สำเร็จ ⇒ แถวรายได้ 0 · % สำเร็จ 0 · รายได้ต่อเคส N/A (ไม่หารศูนย์)', () => {
      const data = buildRevenueSummary({
        groupBy: 'month',
        entries: [],
        previousEntries: [],
        failCases: [{ groupKey: '2026-09-01', groupLabel: 'กันยายน 2569', groupSort: '2026-09-01', caseId: 'f1' }],
      })
      expect(data.rows).toHaveLength(1)
      expect(data.rows[0]).toMatchObject({ revenueSatang: 0, caseCount: 0, failCount: 1, successPct: 0, revenuePerCaseSatang: null })
    })

    it('ไม่มีเคสปิดเลย ⇒ % สำเร็จ N/A · เคส closed_fail ที่ซ้ำกับรายได้นับครั้งเดียว', () => {
      const none = buildRevenueSummary({
        groupBy: 'company',
        entries: [entry({ groupKey: 'co1', caseId: 'x', caseStatus: 'in_progress' })],
        previousEntries: [],
        failCases: [],
      })
      expect(none.totalRow?.['successPct']).toBeNull()

      const dup = buildRevenueSummary({
        groupBy: 'company',
        entries: [entry({ groupKey: 'co1', caseId: 'x', caseStatus: 'closed_fail' })],
        previousEntries: [],
        failCases: [{ groupKey: 'co1', groupLabel: 'co1', groupSort: 'co1', caseId: 'x' }],
      })
      expect(dup.totalRow).toMatchObject({ failCount: 1, successPct: 0 })
      expect(dup.rows[0]).toMatchObject({ failCount: 1 })
    })
  })
})
