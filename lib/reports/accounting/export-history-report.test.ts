import { describe, expect, it } from 'vitest'
import {
  buildExportHistoryReport,
  exportHistoryStatusLabel,
  type ExportHistoryEntry,
} from '@/lib/reports/accounting/export-history-report'

/** A3 (`96` §6-A3) — ประวัติการส่งออกชุดข้อมูลบัญชี (ทุกเวอร์ชัน · งวดที่ยังไม่ส่งต้องเห็น) */

function entry(overrides: Partial<ExportHistoryEntry> = {}): ExportHistoryEntry {
  return {
    recordId: 'export-1',
    periodId: 'period-6',
    periodLabel: 'มิถุนายน 2569',
    yearBe: 2569,
    month: 6,
    version: 1,
    status: 'sent',
    sentAt: new Date('2026-07-03T02:15:00Z'),
    sentByName: 'พี่เบียร์',
    fileCount: 8,
    ...overrides,
  }
}

describe('buildExportHistoryReport', () => {
  it('แสดงทุกเวอร์ชันของงวดเดียวกัน — เวอร์ชันใหม่อยู่บน (ไม่ทับของเดิม `37`)', () => {
    const report = buildExportHistoryReport({
      entries: [
        entry({ recordId: 'v1', version: 1, status: 'accepted' }),
        entry({ recordId: 'v2', version: 2, status: 'sent' }),
      ],
    })

    expect(report.rows).toHaveLength(2)
    expect(report.rows.map((row) => row.version)).toEqual(['v1.1', 'v1.0'])
  })

  it('งวดที่ยังไม่เคยส่งออกมีแถวของตัวเอง ค่าอื่นเป็นค่าว่าง (ไม่ใช่ 0)', () => {
    const report = buildExportHistoryReport({
      entries: [
        entry({
          recordId: null,
          periodId: 'period-8',
          periodLabel: 'สิงหาคม 2569',
          month: 8,
          version: null,
          status: null,
          sentAt: null,
          sentByName: null,
          fileCount: null,
        }),
      ],
    })

    expect(report.rows[0]).toMatchObject({
      period: 'สิงหาคม 2569',
      version: null,
      sentAt: null,
      sentBy: null,
      statusLabel: 'ยังไม่ส่งออก',
      fileCount: null,
      attachmentCount: null,
    })
    expect(report.kpis?.find((kpi) => kpi.key === 'notExported')?.value).toBe(1)
  })

  it('งวดใหม่อยู่บนสุด (เรียงข้ามปีถูกต้อง)', () => {
    const report = buildExportHistoryReport({
      entries: [
        entry({ recordId: 'a', periodId: 'p1', periodLabel: 'ธันวาคม 2568', yearBe: 2568, month: 12 }),
        entry({ recordId: 'b', periodId: 'p2', periodLabel: 'มกราคม 2569', yearBe: 2569, month: 1 }),
      ],
    })
    expect(report.rows.map((row) => row.period)).toEqual(['มกราคม 2569', 'ธันวาคม 2568'])
  })

  it('KPI นับเป็น "จำนวนงวด" ไม่ใช่จำนวนเวอร์ชัน — ส่งซ้ำ 2 เวอร์ชันยังเป็น 1 งวด', () => {
    const report = buildExportHistoryReport({
      entries: [
        entry({ recordId: 'v1', version: 1, status: 'sent' }),
        entry({ recordId: 'v2', version: 2, status: 'accepted' }),
      ],
    })

    expect(report.kpis?.find((kpi) => kpi.key === 'periods')?.value).toBe(1)
    expect(report.kpis?.find((kpi) => kpi.key === 'sent')?.value).toBe(1)
    expect(report.kpis?.find((kpi) => kpi.key === 'accepted')?.value).toBe(1)
    expect(report.kpis?.find((kpi) => kpi.key === 'notExported')?.value).toBe(0)
  })

  it('สถานะ generated ยังไม่นับว่าส่งให้สำนักงานบัญชี', () => {
    const report = buildExportHistoryReport({ entries: [entry({ status: 'generated', sentAt: null, sentByName: null })] })
    expect(exportHistoryStatusLabel('generated')).toBe('สร้างไฟล์แล้ว')
    expect(report.kpis?.find((kpi) => kpi.key === 'sent')?.value).toBe(0)
  })

  it('เอกสารแนบยังไม่รวมในชุด ⇒ ค่าว่างทุกแถว + มีหมายเหตุอธิบาย', () => {
    const report = buildExportHistoryReport({ entries: [entry()] })
    expect(report.rows.every((row) => row['attachmentCount'] === null)).toBe(true)
    expect(report.note).toContain('เอกสารแนบ')
  })
})
