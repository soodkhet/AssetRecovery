import { describe, expect, it } from 'vitest'
import {
  buildCompanyScorecardReport,
  type CompanyScorecardEntry,
} from '@/lib/reports/executive/company-scorecard-report'
import { ROW_KEY } from '@/lib/reports/payload'

/**
 * E2 (`96` §6-E2) — Scorecard รายบริษัทไฟแนนซ์
 *
 * จุดที่ต้องไม่พลาด: คอลัมน์ครบตามเอกสาร · % สำเร็จ นับเฉพาะเคสที่ปิดแล้ว · เรียงตามรายได้ ·
 * บริษัทที่ไม่มีความเคลื่อนไหวและไม่มีหนี้ค้างไม่ต้องมีแถว แต่บริษัทที่ "มีแต่หนี้ค้าง" ต้องยังอยู่
 */

function company(id: string, overrides: Partial<CompanyScorecardEntry> = {}): CompanyScorecardEntry {
  return {
    companyId: id,
    companyName: `บริษัท ${id}`,
    caseCount: 10,
    successCount: 6,
    failCount: 2,
    revenueSatang: 1_000_00,
    directCostSatang: 400_00,
    previousRevenueSatang: 800_00,
    arOutstandingSatang: 0,
    ...overrides,
  }
}

function build(companies: readonly CompanyScorecardEntry[]) {
  return buildCompanyScorecardReport({ companies, rangeLabel: 'สิงหาคม 2569' })
}

describe('buildCompanyScorecardReport', () => {
  it('คอลัมน์ตรงตาม `96` §6-E2 (บริษัท | เคส | %สำเร็จ | รายได้ | กำไร | Margin | AR | เทรนด์)', () => {
    expect(build([company('a')]).columns.map((column) => column.key)).toEqual([
      'company',
      'caseCount',
      'successPct',
      'revenueSatang',
      'grossProfitSatang',
      'marginPct',
      'arOutstandingSatang',
      'revenueTrendPct',
    ])
  })

  it('กำไร/margin จากสูตร `22` §6.12 และ % สำเร็จจากเคสที่ปิดแล้วเท่านั้น', () => {
    const report = build([company('a', { revenueSatang: 1_000_00, directCostSatang: 250_00, caseCount: 50 })])

    expect(report.rows[0]).toMatchObject({
      [ROW_KEY]: 'a',
      grossProfitSatang: 750_00,
      marginPct: 75,
      successPct: 75,
      caseCount: 50,
    })
  })

  it('เรียงตามรายได้จากมากไปน้อย (ใช้เป็นแหล่งของกราฟ Top 5 บน E1)', () => {
    const report = build([
      company('a', { revenueSatang: 100_00 }),
      company('b', { revenueSatang: 900_00 }),
      company('c', { revenueSatang: 500_00 }),
    ])

    expect(report.rows.map((row) => row[ROW_KEY])).toEqual(['b', 'c', 'a'])
  })

  it('เทรนด์ = รายได้เทียบช่วงก่อนหน้า · ช่วงก่อนหน้า 0 ⇒ null (N/A) ห้ามหารศูนย์', () => {
    const report = build([
      company('a', { revenueSatang: 1_200_00, previousRevenueSatang: 1_000_00 }),
      company('b', { revenueSatang: 500_00, previousRevenueSatang: 0 }),
    ])

    expect(report.rows[0]?.['revenueTrendPct']).toBe(20)
    expect(report.rows[1]?.['revenueTrendPct']).toBeNull()
  })

  it('บริษัทที่ไม่มีความเคลื่อนไหวเลยไม่มีแถว แต่บริษัทที่มีแต่หนี้ค้างต้องยังอยู่', () => {
    const report = build([
      company('idle', { caseCount: 0, successCount: 0, failCount: 0, revenueSatang: 0, directCostSatang: 0, previousRevenueSatang: 0 }),
      company('debt', {
        caseCount: 0,
        successCount: 0,
        failCount: 0,
        revenueSatang: 0,
        directCostSatang: 0,
        previousRevenueSatang: 0,
        arOutstandingSatang: 45_000_00,
      }),
    ])

    expect(report.rows.map((row) => row[ROW_KEY])).toEqual(['debt'])
    expect(report.rows[0]).toMatchObject({ successPct: null, marginPct: null, arOutstandingSatang: 45_000_00 })
  })

  it('แถวรวม + KPI คิดจากยอดรวม ไม่ใช่ค่าเฉลี่ยของแถว', () => {
    const report = build([
      company('a', { revenueSatang: 1_000_00, directCostSatang: 200_00, caseCount: 10, successCount: 8, failCount: 2, arOutstandingSatang: 100_00 }),
      company('b', { revenueSatang: 3_000_00, directCostSatang: 1_800_00, caseCount: 20, successCount: 4, failCount: 6, arOutstandingSatang: 200_00 }),
    ])

    expect(report.totalRow).toMatchObject({
      revenueSatang: 4_000_00,
      grossProfitSatang: 2_000_00,
      marginPct: 50,
      caseCount: 30,
      successPct: 60,
      arOutstandingSatang: 300_00,
    })
    expect(report.kpis?.find((item) => item.key === 'arOutstanding')?.value).toBe(300_00)
    expect(report.kpis?.find((item) => item.key === 'companyCount')?.value).toBe(2)
  })
})
