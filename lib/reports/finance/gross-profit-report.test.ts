import { describe, expect, it } from 'vitest'
import { caseStatusLabel } from '@/lib/cases/status-display'
import {
  buildGrossProfitDrilldown,
  buildGrossProfitSummary,
} from '@/lib/reports/finance/gross-profit-report'
import { ROW_KEY } from '@/lib/reports/payload'
import { summarizeProfitability } from '@/lib/reports/profitability'

/**
 * F1 (`96` §6-F1 · §13 "ตัวเลข Revenue/Cost/Profit ตรงกับข้อมูลในไฟล์ 19 และ 17 เสมอ")
 * — ตัวเลขทุกตัวมาจาก `summarizeProfitability()` (3.8) ที่นี่ตรวจ "การแปลงเป็นตาราง" เท่านั้น
 */

const REVENUES = [
  { key: 'c1', label: 'ไฟแนนซ์ A', revenueSatang: 1_000_000, caseId: 'case-1' },
  { key: 'c1', label: 'ไฟแนนซ์ A', revenueSatang: 500_000, caseId: 'case-2' },
] as const

const COSTS = [
  { key: 'c1', label: 'ไฟแนนซ์ A', expenseType: 'commission', grossSatang: 300_000, caseId: 'case-1' },
  { key: 'c1', label: 'ไฟแนนซ์ A', expenseType: 'fuel', grossSatang: 100_000, caseId: 'case-2' },
  // เคสปิดไม่สำเร็จ: มีต้นทุนแต่ไม่มีรายได้ — ต้องกด margin ลงจริง (`21` §6.1)
  { key: 'c2', label: 'ไฟแนนซ์ B', expenseType: 'no_success_fee', grossSatang: 200_000, caseId: 'case-3' },
] as const

const ZERO_TOTAL = { revenueSatang: 0, directCostSatang: 0, grossProfitSatang: 0, marginPct: null }

describe('F1 — ตารางสรุปกำไรขั้นต้น', () => {
  const summary = summarizeProfitability(REVENUES, COSTS)

  it('1 แถว = 1 มิติ พร้อมคีย์เทคนิคสำหรับ drill-down (ไม่ใช่คอลัมน์)', () => {
    const data = buildGrossProfitSummary({ dimension: 'company', summary, previousTotal: ZERO_TOTAL })

    expect(data.columns.map((column) => column.key)).toEqual([
      'dimension',
      'revenueSatang',
      'directCostSatang',
      'grossProfitSatang',
      'marginPct',
      'revenueCaseCount',
      'costCaseCount',
    ])
    // คีย์เทคนิคไม่อยู่ใน columns ⇒ ไม่โผล่บนจอและในไฟล์ export
    expect(data.columns.some((column) => column.key === ROW_KEY)).toBe(false)
    expect(data.rows.map((row) => row[ROW_KEY])).toEqual(['c1', 'c2'])
  })

  it('มิติที่มีแต่ต้นทุนยังอยู่ในตาราง และ margin ของมันเป็น N/A (ห้ามหารศูนย์)', () => {
    const data = buildGrossProfitSummary({ dimension: 'company', summary, previousTotal: ZERO_TOTAL })

    const lossMaking = data.rows.find((row) => row[ROW_KEY] === 'c2')
    expect(lossMaking).toMatchObject({
      revenueSatang: 0,
      directCostSatang: 200_000,
      grossProfitSatang: -200_000,
      marginPct: null,
    })
  })

  it('แถวรวมใช้ยอดรวมจริง ไม่ใช่ค่าเฉลี่ยของ margin รายแถว', () => {
    const data = buildGrossProfitSummary({ dimension: 'company', summary, previousTotal: ZERO_TOTAL })

    expect(data.totalRow).toMatchObject({
      revenueSatang: 1_500_000,
      directCostSatang: 600_000,
      grossProfitSatang: 900_000,
    })
    expect(data.totalRow?.['marginPct']).toBeCloseTo(60, 6)
  })

  it('MoM: งวดก่อนเป็นศูนย์ ⇒ เทียบไม่ได้ (null) ไม่ใช่ 100%', () => {
    const data = buildGrossProfitSummary({ dimension: 'company', summary, previousTotal: ZERO_TOTAL })

    expect(data.kpis?.find((kpi) => kpi.key === 'revenue')?.mom).toMatchObject({
      current: 1_500_000,
      previous: 0,
      changePct: null,
      direction: 'up',
    })
  })

  it('ต้นทุนที่เพิ่มขึ้นไม่ใช่เรื่องดี ⇒ KPI ต้นทุนต้อง higherIsBetter = false', () => {
    const data = buildGrossProfitSummary({
      dimension: 'team',
      summary,
      previousTotal: { revenueSatang: 1_000_000, directCostSatang: 500_000, grossProfitSatang: 500_000, marginPct: 50 },
    })

    expect(data.kpis?.find((kpi) => kpi.key === 'directCost')?.higherIsBetter).toBe(false)
    expect(data.kpis?.find((kpi) => kpi.key === 'directCost')?.mom?.changePct).toBeCloseTo(20, 6)
    expect(data.columns[0]?.header).toBe('ทีม')
  })
})

describe('F1 — drill-down รายเคส', () => {
  it('ยอดรวมของ drill-down เท่ากับแถวสรุปของมิตินั้นเสมอ (`21` §15)', () => {
    const summary = summarizeProfitability(REVENUES, COSTS)
    const row = summary.rows.find((item) => item.key === 'c1')

    const drilldown = buildGrossProfitDrilldown({
      dimension: 'company',
      dimensionLabel: 'ไฟแนนซ์ A',
      statusLabel: caseStatusLabel,
      cases: [
        {
          caseId: 'case-1',
          caseRef: 'SF-2026-001',
          companyName: 'ไฟแนนซ์ A',
          teamName: 'ทีมเหนือ',
          status: 'closed_success',
          revenueSatang: 1_000_000,
          directCostSatang: 300_000,
        },
        {
          caseId: 'case-2',
          caseRef: 'SF-2026-002',
          companyName: 'ไฟแนนซ์ A',
          teamName: 'ทีมเหนือ',
          status: 'closed_success',
          revenueSatang: 500_000,
          directCostSatang: 100_000,
        },
      ],
    })

    expect(drilldown.totalRow?.['revenueSatang']).toBe(row?.revenueSatang)
    expect(drilldown.totalRow?.['directCostSatang']).toBe(row?.directCostSatang)
    expect(drilldown.totalRow?.['grossProfitSatang']).toBe(row?.grossProfitSatang)
    expect(drilldown.rows[0]).toMatchObject({
      caseRef: 'SF-2026-001',
      statusLabel: 'ปิดงานสำเร็จ',
      grossProfitSatang: 700_000,
    })
    expect(drilldown.rows[0]?.['marginPct']).toBeCloseTo(70, 6)
  })

  it('เคสที่มีแต่ต้นทุน (ปิดไม่สำเร็จ) ยังอยู่ในตาราง — margin เป็น N/A', () => {
    const drilldown = buildGrossProfitDrilldown({
      dimension: 'team',
      dimensionLabel: 'ทีมใต้',
      statusLabel: caseStatusLabel,
      cases: [
        {
          caseId: 'case-3',
          caseRef: 'SF-2026-003',
          companyName: 'ไฟแนนซ์ B',
          teamName: 'ทีมใต้',
          status: 'closed_fail',
          revenueSatang: 0,
          directCostSatang: 200_000,
        },
      ],
    })

    expect(drilldown.rows).toHaveLength(1)
    expect(drilldown.rows[0]).toMatchObject({
      statusLabel: 'ปิดงานไม่สำเร็จ',
      grossProfitSatang: -200_000,
      marginPct: null,
    })
    expect(drilldown.totalRow?.['marginPct']).toBeNull()
  })
})
