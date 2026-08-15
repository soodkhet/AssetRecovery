import { describe, expect, it } from 'vitest'
import {
  buildWarehouseSummaryReport,
  type WarehouseCompanyEntry,
} from '@/lib/reports/operations/warehouse-summary-report'

/** O5 (`96` §6-O5) — ยอดคงเหลือ ณ ปัจจุบัน + ส่งมอบแล้วในช่วงที่เลือก */

function company(
  companyId: string,
  counts: Partial<Omit<WarehouseCompanyEntry, 'companyId' | 'companyName'>> = {},
): WarehouseCompanyEntry {
  return {
    companyId,
    companyName: `บริษัท ${companyId.toUpperCase()}`,
    pendingIntake: 0,
    inCustody: 0,
    handoverPending: 0,
    handedOverInRange: 0,
    ...counts,
  }
}

const RANGE_LABEL = 'สิงหาคม 2569'

describe('buildWarehouseSummaryReport', () => {
  it('รวมยอดทุกช่องและมีแถวรวมท้ายตาราง', () => {
    const report = buildWarehouseSummaryReport({
      companies: [
        company('a', { pendingIntake: 2, inCustody: 5, handoverPending: 1, handedOverInRange: 3 }),
        company('b', { inCustody: 4, handedOverInRange: 1 }),
      ],
      rangeLabel: RANGE_LABEL,
    })

    expect(report.totalRow).toEqual({
      company: 'รวมทั้งหมด',
      pendingIntake: 2,
      inCustody: 9,
      handoverPending: 1,
      handedOverInRange: 4,
    })
    expect(report.kpis?.find((kpi) => kpi.key === 'handedOver')?.hint).toBe(RANGE_LABEL)
  })

  it('บริษัทที่ไม่มีเครื่องเลยไม่ขึ้นตาราง (ไม่ใช่แถว 0 ทั้งแถว)', () => {
    const report = buildWarehouseSummaryReport({
      companies: [company('a', { inCustody: 1 }), company('b')],
      rangeLabel: RANGE_LABEL,
    })
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]?.company).toBe('บริษัท A')
  })

  it('เรียงตามจำนวนเครื่องที่ยังอยู่ในความรับผิดชอบ (ไม่นับที่ส่งมอบไปแล้ว)', () => {
    const report = buildWarehouseSummaryReport({
      companies: [
        company('a', { inCustody: 1, handedOverInRange: 99 }),
        company('b', { pendingIntake: 3, handoverPending: 2 }),
      ],
      rangeLabel: RANGE_LABEL,
    })
    expect(report.rows.map((row) => row.company)).toEqual(['บริษัท B', 'บริษัท A'])
  })

  it('ไม่มีข้อมูลเลย ⇒ ตารางว่าง ยอดรวมเป็น 0', () => {
    const report = buildWarehouseSummaryReport({ companies: [], rangeLabel: RANGE_LABEL })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow?.inCustody).toBe(0)
  })

  it('หมายเหตุอธิบายว่า 3 ช่องแรกเป็นยอด ณ ปัจจุบัน', () => {
    const report = buildWarehouseSummaryReport({ companies: [], rangeLabel: RANGE_LABEL })
    expect(report.note).toContain('ยอดคงเหลือ ณ ปัจจุบัน')
    expect(report.note).toContain(RANGE_LABEL)
  })
})
