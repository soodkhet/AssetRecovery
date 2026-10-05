import { describe, expect, it } from 'vitest'
import {
  buildWhtSummaryReport,
  filingMethodText,
  filingStatusLabel,
  type WhtFilingSummaryEntry,
} from '@/lib/reports/accounting/wht-summary-report'

/** A1 (`96` §6-A1) — สรุปรอบนำส่ง WHT · ใบที่ยกเลิกถูกตัดออกตั้งแต่ชั้นสรุปของไฟล์ 33 */

const ASOF = new Date('2026-08-15T05:00:00Z')

function filing(month: number, overrides: Partial<WhtFilingSummaryEntry> = {}): WhtFilingSummaryEntry {
  return {
    periodId: `period-${month}`,
    periodLabel: `เดือน ${month} 2569`,
    yearBe: 2569,
    month,
    filingDueDate: new Date(Date.UTC(2026, month, 15)),
    pnd3Satang: 100_00,
    pnd53Satang: 50_00,
    pnd1Satang: 0,
    status: 'filed',
    ...overrides,
  }
}

describe('buildWhtSummaryReport', () => {
  it('ภ.ง.ด.1 (40(2)) แยกคอลัมน์/KPI และรวมใน "รวม WHT" (มติ PO 05/10/2569 UAT U7)', () => {
    const report = buildWhtSummaryReport({ filings: [filing(6, { pnd1Satang: 1_250 })], asOf: ASOF })
    expect(report.rows[0]).toMatchObject({ pnd1Satang: 1_250, totalSatang: 150_00 + 1_250 })
    expect(report.kpis?.find((kpi) => kpi.key === 'pnd1')?.value).toBe(1_250)
    expect(report.totalRow).toMatchObject({ pnd1Satang: 1_250, totalSatang: 150_00 + 1_250 })
  })

  it('รวมยอดสองแบบเป็น "รวม WHT" ต่อแถวและมีแถวรวมท้ายตาราง', () => {
    const report = buildWhtSummaryReport({
      filings: [filing(6, { pnd3Satang: 8_400_00, pnd53Satang: 2_160_00 }), filing(7)],
      asOf: ASOF,
    })

    expect(report.rows[0]).toMatchObject({ pnd3Satang: 8_400_00, pnd53Satang: 2_160_00, totalSatang: 10_560_00 })
    expect(report.totalRow).toMatchObject({
      period: 'รวมทั้งหมด',
      pnd3Satang: 8_500_00,
      pnd53Satang: 2_210_00,
      totalSatang: 10_710_00,
    })
  })

  it('เรียงงวดจากเก่าไปใหม่ (ข้ามปีด้วย)', () => {
    const report = buildWhtSummaryReport({
      filings: [
        filing(1, { periodId: 'p-2569-01', periodLabel: 'มกราคม 2569' }),
        { ...filing(12, { periodId: 'p-2568-12', periodLabel: 'ธันวาคม 2568' }), yearBe: 2568 },
      ],
      asOf: ASOF,
    })
    expect(report.rows.map((row) => row.period)).toEqual(['ธันวาคม 2568', 'มกราคม 2569'])
  })

  it('รอบที่ยังไม่ยื่นและเลยกำหนดแล้วขึ้นป้าย "เลยกำหนด" — แต่ไม่เปลี่ยนสถานะจริงในสคีมา', () => {
    const overdue = filing(6, { status: 'pending', filingDueDate: new Date('2026-07-15T00:00:00Z') })
    const upcoming = filing(7, { status: 'pending', filingDueDate: new Date('2026-08-15T00:00:00Z') })

    expect(filingStatusLabel(overdue, ASOF)).toBe('รอยื่นแบบ (เลยกำหนด)')
    // ครบกำหนดวันนี้ยังไม่ถือว่าเลยกำหนด
    expect(filingStatusLabel(upcoming, ASOF)).toBe('รอยื่นแบบ')
    expect(filingStatusLabel(filing(5, { status: 'filed', filingDueDate: new Date('2026-06-15T00:00:00Z') }), ASOF)).toBe(
      'ยื่นแล้ว',
    )

    const report = buildWhtSummaryReport({ filings: [overdue, upcoming], asOf: ASOF })
    expect(report.kpis?.find((kpi) => kpi.key === 'pending')?.value).toBe(2)
    expect(report.kpis?.find((kpi) => kpi.key === 'pending')?.hint).toContain('1 รอบ')
  })

  it('ยื่นแล้วไม่นับว่าเลยกำหนดไม่ว่าจะช้าแค่ไหน', () => {
    const late = filing(1, { status: 'filed', filingDueDate: new Date('2025-02-15T00:00:00Z') })
    expect(filingStatusLabel(late, ASOF)).toBe('ยื่นแล้ว')
    const report = buildWhtSummaryReport({ filings: [late], asOf: ASOF })
    expect(report.kpis?.find((kpi) => kpi.key === 'pending')?.value).toBe(0)
  })

  it('ไม่มีรอบนำส่งเลย ⇒ ตารางว่าง ไม่มีแถวรวม และ KPI เป็นศูนย์', () => {
    const report = buildWhtSummaryReport({ filings: [], asOf: ASOF })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow).toBeNull()
    expect(report.kpis?.find((kpi) => kpi.key === 'total')?.value).toBe(0)
  })

  it('หมายเหตุระบุว่าใบที่ยกเลิกไม่ถูกนับ', () => {
    const report = buildWhtSummaryReport({ filings: [], asOf: ASOF })
    expect(report.note).toContain('ยกเลิก')
    // BUG-135 — หมายเหตุที่ผู้ใช้เห็นต้องไม่มีรหัส error ดิบ (เช่น FILING_OVERDUE_WARNING)
    expect(report.note).not.toMatch(/[A-Z]+_[A-Z_]+/)
  })
})

describe('A1 — กำหนดยื่นที่เลื่อนวันหยุด (มติ PO 06/10/2569 UAT U93)', () => {
  it('ไม่ถูกเลื่อน ⇒ ป้ายวิธียื่นอย่างเดียว · ถูกเลื่อน ⇒ ต่อท้ายวันเดิมตามปฏิทิน (พ.ศ.)', () => {
    expect(filingMethodText(filing(6))).toBe('(ยื่นออนไลน์)')
    // ตุลาคม 2569 ออนไลน์: 15/11/2569 (อาทิตย์) ⇒ 16/11/2569
    const shifted = filing(10, { filingDueDate: new Date('2026-11-16T00:00:00Z'), status: 'pending' })
    expect(filingMethodText(shifted)).toBe('(ยื่นออนไลน์) เลื่อนจากวันหยุด 15/11/2569')
    const report = buildWhtSummaryReport({ filings: [shifted], asOf: ASOF })
    expect(report.rows[0]).toMatchObject({ filingDueDate: '2026-11-16', filingMethodLabel: '(ยื่นออนไลน์) เลื่อนจากวันหยุด 15/11/2569' })
  })
})
