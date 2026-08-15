import { describe, expect, it } from 'vitest'
import { ROW_KEY, type ReportRow } from '@/lib/reports/payload'
import {
  buildSuccessRateReport,
  type SuccessRateCaseEntry,
} from '@/lib/reports/operations/success-rate-report'

/**
 * O1 (`96` §6-O1 · §13 · §14) — **% สำเร็จ คิดจากเคสที่ปิดแล้วเท่านั้น**
 */

function entry(
  caseId: string,
  outcome: SuccessRateCaseEntry['outcome'],
  group = 'team-a',
  label = 'ทีม A',
): SuccessRateCaseEntry {
  return { groupKey: group, groupLabel: label, groupSort: group, caseId, outcome }
}

function rowOf(rows: readonly ReportRow[], key: string): ReportRow {
  const found = rows.find((row) => row[ROW_KEY] === key)
  if (found === undefined) throw new Error(`ไม่พบแถว ${key}`)
  return found
}

describe('buildSuccessRateReport', () => {
  it('เคส open ไม่ถูกนับใน success/fail — success rate คำนวณจากเคสที่ปิดแล้วเท่านั้น (`96` §14)', () => {
    const report = buildSuccessRateReport({
      dimension: 'team',
      entries: [
        entry('c1', 'closed_success'),
        entry('c2', 'closed_success'),
        entry('c3', 'closed_fail'),
        entry('c4', null),
        entry('c5', null),
      ],
      previousEntries: [],
    })

    const row = rowOf(report.rows, 'team-a')
    expect(row.caseCount).toBe(5)
    expect(row.successCount).toBe(2)
    expect(row.failCount).toBe(1)
    expect(row.openCount).toBe(2)
    // 2 / (2+1) = 66.7% — ไม่ใช่ 2/5 = 40%
    expect(row.successPct).toBe(66.7)
  })

  it('ยังไม่มีเคสปิดเลย ⇒ % สำเร็จเป็น null (แสดง N/A) ห้ามหารศูนย์', () => {
    const report = buildSuccessRateReport({
      dimension: 'team',
      entries: [entry('c1', null), entry('c2', null)],
      previousEntries: [],
    })
    expect(rowOf(report.rows, 'team-a').successPct).toBeNull()
    expect(report.totalRow?.successPct).toBeNull()
  })

  it('นับเคสไม่ซ้ำแม้มีหลายแถวของเคสเดียวกัน', () => {
    const report = buildSuccessRateReport({
      dimension: 'company',
      entries: [entry('c1', 'closed_success', 'co-1', 'บริษัท A'), entry('c1', 'closed_success', 'co-1', 'บริษัท A')],
      previousEntries: [],
    })
    expect(rowOf(report.rows, 'co-1').caseCount).toBe(1)
    expect(report.totalRow?.caseCount).toBe(1)
  })

  it('รายเดือนเรียงตามลำดับเวลา และ MoM เทียบเดือนก่อนหน้าในอนุกรมเดียวกัน', () => {
    const july: SuccessRateCaseEntry[] = [
      { groupKey: '2026-07-01', groupLabel: 'กรกฎาคม 2569', groupSort: '2026-07-01', caseId: 'j1', outcome: 'closed_success' },
      { groupKey: '2026-07-01', groupLabel: 'กรกฎาคม 2569', groupSort: '2026-07-01', caseId: 'j2', outcome: 'closed_fail' },
    ]
    const august: SuccessRateCaseEntry[] = [
      { groupKey: '2026-08-01', groupLabel: 'สิงหาคม 2569', groupSort: '2026-08-01', caseId: 'a1', outcome: 'closed_success' },
      { groupKey: '2026-08-01', groupLabel: 'สิงหาคม 2569', groupSort: '2026-08-01', caseId: 'a2', outcome: 'closed_success' },
    ]

    const report = buildSuccessRateReport({ dimension: 'month', entries: [...august, ...july], previousEntries: [] })

    expect(report.rows.map((row) => row.group)).toEqual(['กรกฎาคม 2569', 'สิงหาคม 2569'])
    expect(report.rows[0]?.successPct).toBe(50)
    expect(report.rows[1]?.successPct).toBe(100)
    // 50% → 100% = +100%
    expect(report.rows[1]?.changePct).toBe(100)
  })

  it('รายทีม/รายบริษัท เทียบ MoM กับกลุ่มเดียวกันของช่วงก่อนหน้า', () => {
    const report = buildSuccessRateReport({
      dimension: 'team',
      entries: [entry('c1', 'closed_success'), entry('c2', 'closed_success')],
      previousEntries: [entry('p1', 'closed_success'), entry('p2', 'closed_fail')],
    })
    // 50% → 100%
    expect(rowOf(report.rows, 'team-a').changePct).toBe(100)
  })

  it('KPI % ไม่สำเร็จ เป็นส่วนเติมเต็มของ % สำเร็จ และตั้งค่าให้ "มากขึ้น = แย่ลง"', () => {
    const report = buildSuccessRateReport({
      dimension: 'team',
      entries: [entry('c1', 'closed_success'), entry('c2', 'closed_fail'), entry('c3', null)],
      previousEntries: [],
    })
    const failKpi = report.kpis?.find((kpi) => kpi.key === 'failPct')
    expect(failKpi?.value).toBe(50)
    expect(failKpi?.higherIsBetter).toBe(false)
    expect(report.kpis?.find((kpi) => kpi.key === 'successPct')?.value).toBe(50)
  })

  it('รายการว่าง = ผลลัพธ์ว่าง (ผู้จัดการที่ไม่สังกัดทีมใดเลย)', () => {
    const report = buildSuccessRateReport({ dimension: 'team', entries: [], previousEntries: [] })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow?.caseCount).toBe(0)
    expect(report.totalRow?.successPct).toBeNull()
  })
})
