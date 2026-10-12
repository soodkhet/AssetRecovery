import { describe, expect, it } from 'vitest'
import {
  evaluateTaxInvoiceCoverage,
  taxInvoiceCoverageWarning,
  type TaxInvoiceCoverageBatch,
} from '@/lib/sales/tax-invoice-coverage'

/** mytester3 H3-02 — ใบกำกับภาษีครอบเงินที่รับครบไหม (ต่อรอบที่รับชำระครบ + ผลรวมทั้งงวด) */

const ZERO = { vatSatang: 0, totalSatang: 0 }

function batch(overrides: Partial<TaxInvoiceCoverageBatch> = {}): TaxInvoiceCoverageBatch {
  return {
    batchNumber: 'BL-2569-002',
    // ใบแจ้งหนี้ 2,871.54 + VAT 201.01 = 3,072.55
    invoiced: { vatSatang: 20_101, totalSatang: 307_255 },
    // ใบลดหนี้ 186.92 + VAT 13.08 = 200.00
    creditNotes: { vatSatang: 1_308, totalSatang: 20_000 },
    debitNotes: ZERO,
    // หลัง G3-01: ใบที่ 1 2,000.00 (VAT 130.84) + ใบปิดยอด 1,072.55 (VAT 70.17)
    taxInvoices: { vatSatang: 20_101, totalSatang: 307_255 },
    // รับ 2,000 + 786.40 · ลูกค้าหัก 86.15
    receivedSatang: 278_640,
    customerWhtSatang: 8_615,
    bankFeeSatang: 0,
    fullyPaid: true,
    hasReceiptsAwaitingInvoice: false,
    ...overrides,
  }
}

describe('evaluateTaxInvoiceCoverage', () => {
  it('ใบกำกับครอบครบ (หลัง G3-01) ⇒ ไม่มีรอบที่ไม่ตรง · ผลรวมงวดลงตัว', () => {
    const result = evaluateTaxInvoiceCoverage([batch()])
    expect(result).toEqual({
      checkedCount: 1,
      documentsSatang: 287_255,
      settledSatang: 287_255,
      overpaymentSatang: 0,
      differenceSatang: 0,
      mismatches: [],
    })
    expect(taxInvoiceCoverageWarning(result)).toBeNull()
  })

  it('ข้อมูลก่อนแก้ G3-01: ใบสุดท้าย 872.55 ⇒ ใบกำกับขาด 200.00 (VAT ขาด 13.09) · ผลรวมงวดต่าง 200.00', () => {
    const result = evaluateTaxInvoiceCoverage([
      batch({ taxInvoices: { vatSatang: 13_084 + 5_708, totalSatang: 287_255 } }),
    ])
    expect(result.mismatches).toEqual([
      {
        batchNumber: 'BL-2569-002',
        expectedSatang: 287_255,
        documentsSatang: 267_255,
        differenceSatang: 20_000,
        vatDifferenceSatang: 1_309,
      },
    ])
    expect(result.differenceSatang).toBe(20_000)
    const warning = taxInvoiceCoverageWarning(result)
    expect(warning).toContain('1 รอบ')
    expect(warning).toContain('BL-2569-002 ต่าง ฿200.00')
    expect(warning).not.toMatch(/§|`\d/)
  })

  it('ใบเพิ่มหนี้ไม่ออกใบซ้ำ ⇒ เงินรับส่วนเพิ่มหนี้ไม่ทำให้ไม่ตรง', () => {
    const result = evaluateTaxInvoiceCoverage([
      batch({
        creditNotes: ZERO,
        debitNotes: { vatSatang: 140, totalSatang: 2_140 },
        receivedSatang: 307_255 + 2_140 - 8_615,
      }),
    ])
    expect(result.mismatches).toEqual([])
    expect(result.differenceSatang).toBe(0)
  })

  it('รับเกินยอด = ส่วนเกิน ไม่ออกเอกสาร ⇒ ไม่นับเป็นผลต่าง', () => {
    const result = evaluateTaxInvoiceCoverage([batch({ receivedSatang: 278_640 + 500 })])
    expect(result.overpaymentSatang).toBe(500)
    expect(result.differenceSatang).toBe(0)
    expect(result.mismatches).toEqual([])
  })

  it('VAT ไม่ตรงแม้ยอดรวมตรง ⇒ นับเป็นรอบที่ไม่ตรง', () => {
    const result = evaluateTaxInvoiceCoverage([batch({ taxInvoices: { vatSatang: 20_100, totalSatang: 307_255 } })])
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0]?.vatDifferenceSatang).toBe(1)
    expect(result.mismatches[0]?.differenceSatang).toBe(0)
  })

  it('รอบที่ยังรับไม่ครบ / ยังมีเงินรับรอออกใบ ⇒ ไม่ตรวจ', () => {
    const result = evaluateTaxInvoiceCoverage([
      batch({ fullyPaid: false, taxInvoices: ZERO }),
      batch({ batchNumber: 'BL-2569-003', hasReceiptsAwaitingInvoice: true, taxInvoices: ZERO }),
    ])
    expect(result.checkedCount).toBe(0)
    expect(result.mismatches).toEqual([])
    expect(taxInvoiceCoverageWarning(undefined)).toBeNull()
  })

  it('เกิน 5 รอบ ⇒ บอกเลข 5 รอบแรก + จำนวนที่เหลือ', () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      batch({ batchNumber: `BL-2569-01${index}`, taxInvoices: { vatSatang: 20_101, totalSatang: 300_000 } }),
    )
    const warning = taxInvoiceCoverageWarning(evaluateTaxInvoiceCoverage(many))
    expect(warning).toContain('7 รอบ')
    expect(warning).toContain('และอีก 2 รอบ')
  })
})
