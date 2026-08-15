import { describe, expect, it } from 'vitest'
import type { ExceptionCountInput } from '@/lib/accounting/exception'
import {
  buildExceptionSummaryReport,
  type ExceptionPeriodEntry,
} from '@/lib/reports/accounting/exception-summary-report'

/** A4 (`96` §6-A4) — สรุปข้อยกเว้นรายงวด · `authorized` ห้ามนับปนกับ `resolved` (`34` §6.3) */

function count(
  level: ExceptionCountInput['level'],
  status: ExceptionCountInput['status'],
  n = 1,
): ExceptionCountInput {
  return { level, status, count: n }
}

function period(overrides: Partial<ExceptionPeriodEntry> = {}): ExceptionPeriodEntry {
  return {
    periodId: 'period-6',
    periodLabel: 'มิถุนายน 2569',
    yearBe: 2569,
    month: 6,
    counts: [],
    ...overrides,
  }
}

describe('buildExceptionSummaryReport', () => {
  it('แยก "ผ่านแบบมีข้อยกเว้น" ออกจาก "แก้ไขแล้ว" เสมอ', () => {
    const report = buildExceptionSummaryReport({
      periods: [
        period({
          counts: [count('critical', 'authorized'), count('warning', 'resolved'), count('info', 'open')],
        }),
      ],
    })

    expect(report.rows[0]).toMatchObject({
      period: 'มิถุนายน 2569',
      critical: 1,
      warning: 1,
      info: 1,
      resolved: 1,
      authorized: 1,
      open: 1,
    })
    expect(report.kpis?.find((kpi) => kpi.key === 'resolved')?.value).toBe(1)
    expect(report.kpis?.find((kpi) => kpi.key === 'authorized')?.value).toBe(1)
  })

  it('ยอดฝั่งระดับ (critical+warning+info) เท่ากับฝั่งสถานะ (open+authorized+resolved) เสมอ', () => {
    const report = buildExceptionSummaryReport({
      periods: [
        period({
          counts: [
            count('critical', 'open', 2),
            count('warning', 'authorized', 3),
            count('info', 'resolved', 4),
            count('warning', 'open'),
          ],
        }),
      ],
    })

    const row = report.rows[0]
    const byLevel = Number(row?.critical) + Number(row?.warning) + Number(row?.info)
    const byStatus = Number(row?.open) + Number(row?.authorized) + Number(row?.resolved)
    expect(byLevel).toBe(10)
    expect(byStatus).toBe(10)
  })

  it('KPI "Critical ที่ยังเปิดอยู่" นับเฉพาะ critical+open (authorized ไม่นับเป็นตัวบล็อก)', () => {
    const report = buildExceptionSummaryReport({
      periods: [
        period({ counts: [count('critical', 'open', 2), count('critical', 'authorized', 5)] }),
      ],
    })

    expect(report.kpis?.find((kpi) => kpi.key === 'blockingCritical')?.value).toBe(2)
    expect(report.kpis?.find((kpi) => kpi.key === 'blockingCritical')?.hint).toContain('บล็อก')
  })

  it('งวดที่ไม่มีข้อยกเว้นเลยยังมีแถว (ยอดเป็น 0) — งวดสะอาดคือข้อมูลที่ต้องเห็น', () => {
    const report = buildExceptionSummaryReport({ periods: [period()] })
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({ critical: 0, warning: 0, info: 0, open: 0, authorized: 0, resolved: 0 })
  })

  it('งวดใหม่อยู่บนสุด + แถวรวมท้ายตารางรวมทุกงวด', () => {
    const report = buildExceptionSummaryReport({
      periods: [
        period({ periodId: 'p6', periodLabel: 'มิถุนายน 2569', month: 6, counts: [count('critical', 'open')] }),
        period({ periodId: 'p7', periodLabel: 'กรกฎาคม 2569', month: 7, counts: [count('warning', 'resolved', 2)] }),
      ],
    })

    expect(report.rows.map((row) => row.period)).toEqual(['กรกฎาคม 2569', 'มิถุนายน 2569'])
    expect(report.totalRow).toMatchObject({ period: 'รวมทั้งหมด', critical: 1, warning: 2, resolved: 2, open: 1 })
  })

  it('ไม่มีงวดในช่วงที่เลือก ⇒ ตารางว่าง ไม่มีแถวรวม', () => {
    const report = buildExceptionSummaryReport({ periods: [] })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow).toBeNull()
    expect(report.note).toContain('ผ่านแบบมีข้อยกเว้น')
  })
})
