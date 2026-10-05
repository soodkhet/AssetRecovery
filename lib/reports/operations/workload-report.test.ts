import { describe, expect, it } from 'vitest'
import { ROW_KEY, type ReportRow } from '@/lib/reports/payload'
import { buildWorkloadReport, type WorkloadEntry } from '@/lib/reports/operations/workload-report'

/** O3 (`96` §6-O3) — ปริมาณงานรายพนักงาน · % ความสำเร็จตามนิยาม `40` §6.2 */

function entry(caseId: string, result: WorkloadEntry['result'], agentId = 'agent-a'): WorkloadEntry {
  return { agentId, agentName: agentId === 'agent-a' ? 'สมชาย' : 'สมหญิง', teamName: 'ทีม A', caseId, result }
}

function rowOf(rows: readonly ReportRow[], key: string): ReportRow {
  const found = rows.find((row) => row[ROW_KEY] === key)
  if (found === undefined) throw new Error(`ไม่พบแถว ${key}`)
  return found
}

describe('buildWorkloadReport', () => {
  it('แยกปิดสำเร็จ / ปิดไม่สำเร็จ / ค้างอยู่ และ % ความสำเร็จหารด้วยเคสที่ปิดแล้ว (มติ PO 03/10/2569 UAT Q20)', () => {
    const report = buildWorkloadReport({
      entries: [
        entry('c1', 'closed_success'),
        entry('c2', 'closed_success'),
        entry('c3', 'closed_fail'),
        entry('c4', 'open'),
      ],
      previousEntries: [],
    })

    const row = rowOf(report.rows, 'agent-a')
    expect(row.caseCount).toBe(4)
    expect(row.successCount).toBe(2)
    expect(row.failCount).toBe(1)
    expect(row.openCount).toBe(1)
    // 2/3 = 66.67% — งานที่ยังค้างไม่เข้าตัวหาร (นิยามเดียวกับ O1)
    expect(row.successPct).toBe(66.67)
  })

  it('รับงานแล้วแต่ยังไม่ปิดสักเคส ⇒ % ความสำเร็จ = null (แสดง N/A) ไม่ใช่ 0% (BUG-060)', () => {
    const report = buildWorkloadReport({ entries: [entry('c1', 'open'), entry('c2', 'open')], previousEntries: [] })
    expect(rowOf(report.rows, 'agent-a').successPct).toBeNull()
    expect(report.totalRow?.['successPct']).toBeNull()
  })

  it('นับเคสไม่ซ้ำเมื่อเคสเดิมถูกมอบหมายหลายรอบ', () => {
    const report = buildWorkloadReport({
      entries: [entry('c1', 'open'), entry('c1', 'closed_success')],
      previousEntries: [],
    })
    expect(rowOf(report.rows, 'agent-a').caseCount).toBe(1)
    expect(rowOf(report.rows, 'agent-a').successCount).toBe(1)
  })

  it('ไม่เคยรับงานเลย ⇒ ไม่มีแถว · รวมทั้งหมดเป็น null ไม่ใช่ 0%', () => {
    const report = buildWorkloadReport({ entries: [], previousEntries: [] })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow?.successPct).toBeNull()
  })

  it('เรียงจากคนที่รับงานมากที่สุด และ KPI นับพนักงานที่มีงานจริง', () => {
    const report = buildWorkloadReport({
      entries: [entry('c1', 'open', 'agent-b'), entry('c2', 'open'), entry('c3', 'open')],
      previousEntries: [],
    })
    expect(report.rows.map((row) => row[ROW_KEY])).toEqual(['agent-a', 'agent-b'])
    expect(report.kpis?.find((kpi) => kpi.key === 'caseCount')?.hint).toContain('2 คน')
  })

  it('KPI เทียบ MoM กับช่วงก่อนหน้า', () => {
    const report = buildWorkloadReport({
      entries: [entry('c1', 'open'), entry('c2', 'open')],
      previousEntries: [entry('p1', 'closed_success')],
    })
    expect(report.kpis?.find((kpi) => kpi.key === 'caseCount')?.mom?.changePct).toBe(100)
  })
})
