import { describe, expect, it } from 'vitest'
import {
  buildKpiSummaryReport,
  lastMonthlyPeriods,
  TREND_MONTHS,
  type ExecutiveMonthEntry,
  type ExecutiveTotals,
} from '@/lib/reports/executive/kpi-summary-report'
import { toIsoDateOnly } from '@/lib/reports/period'

/**
 * E1 (`96` §6-E1 · §13) — KPI 6 การ์ด + เทรนด์ 12 เดือน
 *
 * จุดที่ต้องไม่พลาด: กำไร/margin ตรงกับ `22` §6.12 · % สำเร็จ นับเฉพาะเคสที่ปิดแล้ว ·
 * ตัวหาร 0 ⇒ N/A (ห้ามหารศูนย์) · AR ไม่มี badge MoM (เป็นยอด ณ วันที่)
 */

function month(index: number, overrides: Partial<ExecutiveMonthEntry> = {}): ExecutiveMonthEntry {
  return {
    monthKey: `2026-0${index}-01`,
    monthLabel: `เดือน ${index} 2569`,
    revenueSatang: 1_000_00,
    directCostSatang: 400_00,
    caseCount: 10,
    successCount: 6,
    failCount: 2,
    ...overrides,
  }
}

function totals(overrides: Partial<ExecutiveTotals> = {}): ExecutiveTotals {
  return {
    revenueSatang: 10_000_00,
    directCostSatang: 4_000_00,
    caseCount: 100,
    successCount: 60,
    failCount: 20,
    ...overrides,
  }
}

function build(overrides: Partial<Parameters<typeof buildKpiSummaryReport>[0]> = {}) {
  return buildKpiSummaryReport({
    months: [month(1), month(2)],
    current: totals(),
    previous: totals(),
    arOutstandingSatang: 250_000_00,
    arCompanyCount: 3,
    rangeLabel: 'ปี 2569',
    trendLabel: 'เดือน 1 2569 – เดือน 2 2569',
    ...overrides,
  })
}

function kpi(report: ReturnType<typeof build>, key: string) {
  const found = report.kpis?.find((item) => item.key === key)
  if (found === undefined) throw new Error(`ไม่พบ KPI ${key}`)
  return found
}

describe('lastMonthlyPeriods', () => {
  it('คืน 12 เดือนย้อนหลังโดยเดือนของ endDate เป็นเดือนสุดท้าย และเรียงเก่า → ใหม่', () => {
    const periods = lastMonthlyPeriods(new Date('2026-08-31T00:00:00.000Z'), TREND_MONTHS)

    expect(periods).toHaveLength(12)
    expect(periods[0]?.key).toBe('2025-09-01')
    expect(periods.at(-1)?.key).toBe('2026-08-01')
    // ป้ายเป็น พ.ศ. เสมอ (Rule 01)
    expect(periods.at(-1)?.label).toContain('2569')
  })

  it('เดือนสุดท้ายครอบคลุมถึงวันสุดท้ายของเดือน และเดือนก่อนหน้าต่อกันไม่มีรู', () => {
    const periods = lastMonthlyPeriods(new Date('2026-03-15T00:00:00.000Z'), 3)

    expect(periods.map((period) => period.key)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(toIsoDateOnly(periods[1]?.endDate ?? new Date(0))).toBe('2026-02-28')
    expect(toIsoDateOnly(periods.at(-1)?.endDate ?? new Date(0))).toBe('2026-03-31')
  })

  it('count <= 0 ⇒ ว่าง (ไม่ throw)', () => {
    expect(lastMonthlyPeriods(new Date('2026-08-15T00:00:00.000Z'), 0)).toEqual([])
  })
})

describe('buildKpiSummaryReport', () => {
  it('การ์ด KPI ครบ 6 ตัวตามลำดับของ `96` §6-E1', () => {
    expect(build().kpis?.map((item) => item.key)).toEqual([
      'revenue',
      'grossProfit',
      'marginPct',
      'caseCount',
      'successPct',
      'arOutstanding',
    ])
  })

  it('กำไรขั้นต้น = รายได้ − ต้นทุนตรง และ margin คิดจากยอดรวมของช่วงที่เลือก', () => {
    const report = build({ current: totals({ revenueSatang: 1_000_00, directCostSatang: 250_00 }) })

    expect(kpi(report, 'grossProfit').value).toBe(750_00)
    expect(kpi(report, 'marginPct').value).toBe(75)
  })

  it('รายได้ 0 ⇒ margin = null (N/A) ห้ามหารศูนย์', () => {
    const report = build({ current: totals({ revenueSatang: 0, directCostSatang: 500_00 }) })

    expect(kpi(report, 'marginPct').value).toBeNull()
    expect(kpi(report, 'grossProfit').value).toBe(-500_00)
  })

  it('% สำเร็จ คิดจากเคสที่ปิดแล้วเท่านั้น — เคสที่ยังไม่ปิดไม่เข้าตัวหาร', () => {
    const report = build({ current: totals({ caseCount: 100, successCount: 6, failCount: 2 }) })

    // 6 ÷ (6+2) = 75% ไม่ใช่ 6 ÷ 100
    expect(kpi(report, 'successPct').value).toBe(75)
  })

  it('ยังไม่มีเคสปิดเลย ⇒ % สำเร็จ = null (N/A)', () => {
    const report = build({ current: totals({ caseCount: 30, successCount: 0, failCount: 0 }) })

    expect(kpi(report, 'successPct').value).toBeNull()
  })

  it('badge MoM เทียบกับช่วงก่อนหน้า และ AR ไม่มี MoM (เป็นยอด ณ วันที่)', () => {
    const report = build({
      current: totals({ revenueSatang: 1_500_00 }),
      previous: totals({ revenueSatang: 1_000_00 }),
    })

    expect(kpi(report, 'revenue').mom).toMatchObject({ changePct: 50, direction: 'up' })
    expect(kpi(report, 'arOutstanding').mom).toBeUndefined()
    expect(kpi(report, 'arOutstanding').value).toBe(250_000_00)
    expect(kpi(report, 'arOutstanding').higherIsBetter).toBe(false)
  })

  it('Final Test ด่าน 2 — ค่าที่เป็น N/A ต้องไม่มี badge MoM (ห้ามแปลง null เป็น 0 แล้วเทียบ)', () => {
    const report = build({
      // งวดนี้รายได้ 0 ⇒ margin = N/A · งวดก่อน 60% ⇒ ถ้าแปลงเป็น 0 จะได้ badge "↓ 100.0%" สีแดง
      // ทั้งที่ค่าบนการ์ดคือ N/A ⇒ ผู้บริหารอ่านว่ากำไรตก 100%
      current: totals({ revenueSatang: 0, directCostSatang: 0, successCount: 0, failCount: 0 }),
      previous: totals({ revenueSatang: 10_000_00, directCostSatang: 4_000_00 }),
    })

    expect(kpi(report, 'marginPct').value).toBeNull()
    expect(kpi(report, 'marginPct').mom).toBeUndefined()
    expect(kpi(report, 'successPct').value).toBeNull()
    expect(kpi(report, 'successPct').mom).toBeUndefined()
    // ค่าที่ยังเทียบได้ตามปกติต้องไม่ถูกกระทบ
    expect(kpi(report, 'revenue').mom).toMatchObject({ direction: 'down' })
  })

  it('Final Test ด่าน 2 — งวดก่อนหน้าเป็น N/A ก็เทียบไม่ได้เช่นกัน (ไม่ใช่ "โตจาก 0%")', () => {
    const report = build({
      current: totals({ revenueSatang: 10_000_00, directCostSatang: 4_000_00 }),
      previous: totals({ revenueSatang: 0, directCostSatang: 0, successCount: 0, failCount: 0 }),
    })

    expect(kpi(report, 'marginPct').value).toBe(60)
    expect(kpi(report, 'marginPct').mom).toBeUndefined()
    expect(kpi(report, 'successPct').mom).toBeUndefined()
  })

  it('ช่วงก่อนหน้าเป็น 0 ⇒ changePct = null (N/A) ไม่ใช่ 100%', () => {
    const report = build({ previous: totals({ revenueSatang: 0 }) })

    expect(kpi(report, 'revenue').mom?.changePct).toBeNull()
  })

  it('แถวของตารางคือเทรนด์รายเดือนตามลำดับที่ส่งเข้ามา พร้อมกำไร/margin/% สำเร็จรายเดือน', () => {
    const report = build({
      months: [
        month(1, { revenueSatang: 800_00, directCostSatang: 300_00, successCount: 4, failCount: 1 }),
        month(2, { revenueSatang: 0, directCostSatang: 100_00, successCount: 0, failCount: 0 }),
      ],
    })

    expect(report.rows[0]).toMatchObject({
      month: 'เดือน 1 2569',
      grossProfitSatang: 500_00,
      marginPct: 62.5,
      successPct: 80,
    })
    // เดือนที่ไม่มีรายได้แต่มีต้นทุน ต้องยังอยู่ในกราฟและติดลบจริง (`21` §6.1)
    expect(report.rows[1]).toMatchObject({ grossProfitSatang: -100_00, marginPct: null, successPct: null })
  })

  it('แถวรวมท้ายตารางเป็นยอดของ 12 เดือน ไม่ใช่ของช่วงที่เลือก', () => {
    const report = build({
      months: [month(1), month(2)],
      current: totals({ revenueSatang: 99_999_00 }),
    })

    expect(report.totalRow).toMatchObject({ revenueSatang: 2_000_00, directCostSatang: 800_00, caseCount: 20 })
  })

  it('note บอกความต่างของขอบเขต KPI กับตาราง (กันอ่านตัวเลขผิดขอบเขต)', () => {
    const report = build()

    expect(report.note).toContain('ปี 2569')
    expect(report.note).toContain(`${TREND_MONTHS} เดือนย้อนหลัง`)
  })
})
