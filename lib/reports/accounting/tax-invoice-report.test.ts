import { describe, expect, it } from 'vitest'
import {
  buildTaxInvoiceReport,
  TAX_INVOICE_DIMENSION_LABEL,
  type TaxInvoiceEntry,
} from '@/lib/reports/accounting/tax-invoice-report'

/** A2 (`96` §6-A2) — สรุปใบกำกับภาษี · ใบที่ยกเลิกไม่นับยอดแต่ต้องเห็นจำนวน */

let seq = 0

function invoice(overrides: Partial<TaxInvoiceEntry> = {}): TaxInvoiceEntry {
  seq += 1
  return {
    invoiceId: `inv-${seq}`,
    groupKey: '2026-06-01',
    groupLabel: 'มิถุนายน 2569',
    groupSort: '2026-06-01',
    cancelled: false,
    totalBeforeVatSatang: 100_000_00,
    vatSatang: 7_000_00,
    totalSatang: 107_000_00,
    ...overrides,
  }
}

describe('buildTaxInvoiceReport', () => {
  it('รวมยอดต่อกลุ่มและมีแถวรวมท้ายตาราง', () => {
    const report = buildTaxInvoiceReport({
      dimension: 'month',
      invoices: [invoice(), invoice({ totalBeforeVatSatang: 50_000_00, vatSatang: 3_500_00, totalSatang: 53_500_00 })],
    })

    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({
      group: 'มิถุนายน 2569',
      invoiceCount: 2,
      beforeVatSatang: 150_000_00,
      vatSatang: 10_500_00,
      totalSatang: 160_500_00,
      cancelledCount: null,
    })
    expect(report.totalRow).toMatchObject({ group: 'รวมทั้งหมด', invoiceCount: 2, totalSatang: 160_500_00 })
  })

  it('ใบที่ยกเลิกไม่ถูกนับในยอดและใน "จำนวนใบ" แต่ขึ้นในคอลัมน์ยกเลิก (`31`)', () => {
    const report = buildTaxInvoiceReport({
      dimension: 'month',
      invoices: [invoice(), invoice({ cancelled: true })],
    })

    expect(report.rows[0]).toMatchObject({
      invoiceCount: 1,
      beforeVatSatang: 100_000_00,
      vatSatang: 7_000_00,
      totalSatang: 107_000_00,
      cancelledCount: 1,
    })
    expect(report.kpis?.find((kpi) => kpi.key === 'invoiceCount')?.hint).toContain('ยกเลิก 1 ใบ')
  })

  it('กลุ่มที่มีแต่ใบยกเลิก ⇒ ยอดเป็นศูนย์ แต่ยังมีแถวให้เห็นว่ามีการยกเลิก', () => {
    const report = buildTaxInvoiceReport({
      dimension: 'month',
      invoices: [invoice({ cancelled: true }), invoice({ cancelled: true })],
    })
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({ invoiceCount: 0, totalSatang: 0, cancelledCount: 2 })
  })

  it('มิติรายบริษัท: แยกแถวตามกลุ่ม + หัวคอลัมน์แรกเปลี่ยนตามมิติ', () => {
    const report = buildTaxInvoiceReport({
      dimension: 'company',
      invoices: [
        invoice({ groupKey: 'company-b', groupLabel: 'ไฟแนนซ์ ข', groupSort: 'ไฟแนนซ์ ข' }),
        invoice({ groupKey: 'company-a', groupLabel: 'ไฟแนนซ์ ก', groupSort: 'ไฟแนนซ์ ก' }),
      ],
    })

    expect(report.columns[0]?.header).toBe('บริษัทไฟแนนซ์')
    expect(report.rows.map((row) => row.group)).toEqual(['ไฟแนนซ์ ก', 'ไฟแนนซ์ ข'])
    expect(TAX_INVOICE_DIMENSION_LABEL.company).toBe('รายบริษัทไฟแนนซ์')
  })

  it('เรียงกลุ่มรายเดือนตามเวลาจริง ไม่ใช่ตามชื่อเดือนไทย', () => {
    const report = buildTaxInvoiceReport({
      dimension: 'month',
      invoices: [
        invoice({ groupKey: '2026-07-01', groupLabel: 'กรกฎาคม 2569', groupSort: '2026-07-01' }),
        invoice({ groupKey: '2026-06-01', groupLabel: 'มิถุนายน 2569', groupSort: '2026-06-01' }),
      ],
    })
    expect(report.rows.map((row) => row.group)).toEqual(['มิถุนายน 2569', 'กรกฎาคม 2569'])
  })

  it('ไม่มีใบเลย ⇒ ตารางว่าง ไม่มีแถวรวม', () => {
    const report = buildTaxInvoiceReport({ dimension: 'month', invoices: [] })
    expect(report.rows).toHaveLength(0)
    expect(report.totalRow).toBeNull()
    expect(report.note).toContain('ยกเลิก')
  })
})
