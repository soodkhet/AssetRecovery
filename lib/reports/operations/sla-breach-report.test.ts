import { describe, expect, it } from 'vitest'
import { buildSlaBreachReport, type SlaBreachCaseEntry } from '@/lib/reports/operations/sla-breach-report'

/** O4 (`96` §6-O4) — `created_at + slaAlertHours < now` · เงินเป็น satang */

const ASOF = new Date('2026-08-15T00:00:00Z')

function caseEntry(id: string, receivedAt: string, projected: number | null = 500_00): SlaBreachCaseEntry {
  return {
    caseId: id,
    caseRef: `SF-${id}`,
    companyName: 'บริษัท A',
    agentName: 'สมชาย',
    teamName: 'ทีม A',
    receivedAt: new Date(receivedAt),
    statusLabel: 'กำลังติดตาม',
    projectedRevenueSatang: projected,
  }
}

describe('buildSlaBreachReport', () => {
  it('ครบเกณฑ์พอดียังไม่เกิน — เกินแล้วจึงขึ้นรายงาน', () => {
    const report = buildSlaBreachReport({
      cases: [
        caseEntry('exact', '2026-08-12T00:00:00Z'), // ครบ 72 ชม. พอดี
        caseEntry('over', '2026-08-11T00:00:00Z'), // 96 ชม.
      ],
      slaAlertHours: 72,
      asOf: ASOF,
    })

    expect(report.rows.map((row) => row.caseRef)).toEqual(['SF-over'])
    expect(report.rows[0]?.overdueDays).toBe(1)
  })

  it('เรียงเคสที่ค้างนานที่สุดขึ้นก่อน และ KPI บอกเคสที่แย่ที่สุด', () => {
    const report = buildSlaBreachReport({
      cases: [caseEntry('a', '2026-08-10T00:00:00Z'), caseEntry('b', '2026-08-01T00:00:00Z')],
      slaAlertHours: 72,
      asOf: ASOF,
    })
    expect(report.rows.map((row) => row.caseRef)).toEqual(['SF-b', 'SF-a'])
    expect(report.kpis?.find((kpi) => kpi.key === 'worstOverdue')?.value).toBe(11)
    expect(report.kpis?.find((kpi) => kpi.key === 'breachCount')?.value).toBe(2)
  })

  it('ยอดประมาณการรายได้รวมเป็น satang และเคสที่ไม่มีค่าไม่ถูกนับเป็น 0 ในคอลัมน์', () => {
    const report = buildSlaBreachReport({
      cases: [caseEntry('a', '2026-08-01T00:00:00Z', 123_45), caseEntry('b', '2026-08-01T00:00:00Z', null)],
      slaAlertHours: 72,
      asOf: ASOF,
    })
    expect(report.kpis?.find((kpi) => kpi.key === 'projectedRevenue')?.value).toBe(12345)
    expect(report.rows.find((row) => row.caseRef === 'SF-b')?.projectedRevenueSatang).toBeNull()
    expect(report.totalRow?.projectedRevenueSatang).toBe(12345)
  })

  it('ไม่มีเคสเกิน ⇒ ตารางว่างและไม่มีแถวรวม (empty state)', () => {
    const report = buildSlaBreachReport({
      cases: [caseEntry('a', '2026-08-14T00:00:00Z')],
      slaAlertHours: 72,
      asOf: ASOF,
    })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow).toBeNull()
    expect(report.kpis?.find((kpi) => kpi.key === 'worstOverdue')?.value).toBeNull()
  })

  it('เกณฑ์ SLA ที่ตั้งไว้สั้นลง ทำให้เคสเดิมเข้ารายงาน (ค่าไม่ hardcode)', () => {
    const cases = [caseEntry('a', '2026-08-14T00:00:00Z')]
    expect(buildSlaBreachReport({ cases, slaAlertHours: 72, asOf: ASOF }).rows).toHaveLength(0)
    expect(buildSlaBreachReport({ cases, slaAlertHours: 12, asOf: ASOF }).rows).toHaveLength(1)
  })

  it('วันที่ในแถวเป็น ISO (ชั้นแสดงผลแปลงเป็น พ.ศ. เอง)', () => {
    const report = buildSlaBreachReport({
      cases: [caseEntry('a', '2026-08-01T00:00:00Z')],
      slaAlertHours: 72,
      asOf: ASOF,
    })
    expect(report.rows[0]?.receivedAt).toBe('2026-08-01T00:00:00.000Z')
  })
})
