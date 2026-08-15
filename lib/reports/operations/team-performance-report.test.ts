import { describe, expect, it } from 'vitest'
import { ROW_KEY, type ReportRow } from '@/lib/reports/payload'
import {
  buildTeamPerformanceReport,
  type TeamPerformanceEntry,
} from '@/lib/reports/operations/team-performance-report'

/** O2 (`96` §6-O2 · §13 · §14) — TAT calendar days + เกณฑ์ SLA จากค่าตั้งองค์กร */

function entry(caseId: string, tatHours: number, teamId = 'team-a', teamName = 'ทีม A'): TeamPerformanceEntry {
  return { teamId, teamName, caseId, tatHours }
}

function rowOf(rows: readonly ReportRow[], key: string): ReportRow {
  const found = rows.find((row) => row[ROW_KEY] === key)
  if (found === undefined) throw new Error(`ไม่พบแถว ${key}`)
  return found
}

describe('buildTeamPerformanceReport', () => {
  it('TAT เฉลี่ย/เร็วสุด/ช้าสุด เป็นวันตามปฏิทิน', () => {
    const report = buildTeamPerformanceReport({
      entries: [entry('c1', 24), entry('c2', 48), entry('c3', 120)],
      slaAlertHours: 72,
    })

    const row = rowOf(report.rows, 'team-a')
    expect(row.caseCount).toBe(3)
    expect(row.avgTatDays).toBe(2.7) // (24+48+120)/3 = 64 ชม. = 2.666… วัน → ปัด 1 ตำแหน่ง
    expect(row.minTatDays).toBe(1)
    expect(row.maxTatDays).toBe(5)
  })

  it('เกณฑ์ SLA มาจากค่าที่ส่งเข้ามา — ครบพอดียังนับว่าอยู่ในเกณฑ์', () => {
    const entries = [entry('c1', 72), entry('c2', 72.5)]
    const strict = buildTeamPerformanceReport({ entries, slaAlertHours: 72 })
    expect(rowOf(strict.rows, 'team-a').withinSla).toBe(1)
    expect(rowOf(strict.rows, 'team-a').overSla).toBe(1)

    const loose = buildTeamPerformanceReport({ entries, slaAlertHours: 96 })
    expect(rowOf(loose.rows, 'team-a').withinSla).toBe(2)
    expect(rowOf(loose.rows, 'team-a').overSla).toBe(0)
  })

  it('% ภายใน SLA ต่อทีม และ KPI รวมสอดคล้องกัน', () => {
    const report = buildTeamPerformanceReport({
      entries: [entry('c1', 24), entry('c2', 200), entry('c3', 24, 'team-b', 'ทีม B')],
      slaAlertHours: 72,
    })
    expect(rowOf(report.rows, 'team-a').withinSlaPct).toBe(50)
    expect(rowOf(report.rows, 'team-b').withinSlaPct).toBe(100)
    expect(report.kpis?.find((kpi) => kpi.key === 'withinSlaPct')?.value).toBe(66.7)
    expect(report.kpis?.find((kpi) => kpi.key === 'overSla')?.value).toBe(1)
  })

  it('เคสที่ยังไม่ถูกมอบหมายทีม จัดกลุ่มเป็น "ไม่ระบุทีม" ไม่ใช่หายไป', () => {
    const report = buildTeamPerformanceReport({
      entries: [{ teamId: null, teamName: null, caseId: 'c9', tatHours: 10 }],
      slaAlertHours: 72,
    })
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]?.team).toBe('ไม่ระบุทีม')
  })

  it('ไม่มีเคสปิดเลย ⇒ ตารางว่าง TAT/% เป็น null (ห้ามหารศูนย์)', () => {
    const report = buildTeamPerformanceReport({ entries: [], slaAlertHours: 72 })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow?.avgTatDays).toBeNull()
    expect(report.totalRow?.withinSlaPct).toBeNull()
  })

  it('เรียงจากทีมที่ปิดงานเร็วสุดไปช้าสุด', () => {
    const report = buildTeamPerformanceReport({
      entries: [entry('c1', 200), entry('c2', 10, 'team-b', 'ทีม B')],
      slaAlertHours: 72,
    })
    expect(report.rows.map((row) => row.team)).toEqual(['ทีม B', 'ทีม A'])
  })
})
