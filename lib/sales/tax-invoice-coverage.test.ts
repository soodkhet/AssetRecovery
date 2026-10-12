import { describe, expect, it } from 'vitest'
import { receiptInvoiceAmounts, type PriorInvoiceAmounts } from '@/lib/sales/receipt-invoice'
import {
  adjustmentNetByBatch,
  countReceiptsAwaitingTaxInvoice,
  evaluateTaxInvoiceCoverage,
  receiptAwaitsTaxInvoice,
  taxInvoiceCoverageWarning,
  taxInvoiceExcessOverNetValue,
  taxInvoiceOverNetValueWarning,
  type TaxInvoiceCoverageBatch,
} from '@/lib/sales/tax-invoice-coverage'
import { UNINVOICED_REDUCTION_WAIVE_REASON } from '@/lib/sales/uninvoiced-reduction'

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
      overNetValue: [],
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

describe('รีวิว mytester3 #4 — ใบอัตรา VAT ต่างจากใบแจ้งหนี้ (U96 #9)', () => {
  // ใบแจ้งหนี้ 1,000 + VAT 7% = 1,070 · รับเงินหลังอัตราเปลี่ยนเป็น 10% ⇒ ใบปิดยอด 1,000 + 100 = 1,100 (ลูกค้าจ่าย 1,100)
  const mixed = (taxInvoices: TaxInvoiceCoverageBatch['taxInvoices'], receivedSatang: number) =>
    batch({
      invoiced: { beforeVatSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 },
      creditNotes: ZERO,
      taxInvoices,
      receivedSatang,
      customerWhtSatang: 0,
      vatRateDiffers: true,
    })

  it('มูลค่าก่อน VAT ออกใบครบ ⇒ ไม่เตือน แม้ VAT/ยอดรวมต่างจากใบแจ้งหนี้ · ผลรวมงวดลงตัว', () => {
    const result = evaluateTaxInvoiceCoverage([mixed({ beforeVatSatang: 100_000, vatSatang: 10_000, totalSatang: 110_000 }, 110_000)])
    expect(result.mismatches).toEqual([])
    expect(result.differenceSatang).toBe(0)
    expect(taxInvoiceCoverageWarning(result)).toBeNull()
  })

  it('มูลค่าก่อน VAT ขาด ⇒ เตือนด้วยผลต่างก่อน VAT (ไม่เทียบ VAT)', () => {
    // ลูกค้าจ่าย 1,070 ตามใบแจ้งหนี้ ⇒ ใบรับบางส่วน 972.73 + 97.27
    const result = evaluateTaxInvoiceCoverage([mixed({ beforeVatSatang: 97_273, vatSatang: 9_727, totalSatang: 107_000 }, 107_000)])
    expect(result.mismatches).toEqual([
      expect.objectContaining({ batchNumber: 'BL-2569-002', differenceSatang: 2_727, vatDifferenceSatang: 0 }),
    ])
  })

  it('อัตราเดียวกัน (ไม่ส่งธง) ⇒ ยังเทียบ VAT ตามเดิม', () => {
    const result = evaluateTaxInvoiceCoverage([batch({ taxInvoices: { vatSatang: 20_100, totalSatang: 307_255 } })])
    expect(result.mismatches).toEqual([expect.objectContaining({ differenceSatang: 0, vatDifferenceSatang: 1 })])
  })
})

describe('รีวิว mytester3 #5 — receiptAwaitsTaxInvoice', () => {
  const base = {
    hasActiveInvoice: false,
    coveredByLegacyInvoice: false,
    batchFullyPaid: true,
    invoicedBeforeVatSatang: 100_000,
    billedBeforeVatSatang: 100_000,
  }

  it('เงินรับส่วนเพิ่มหนี้หลังใบปิดยอดของรอบที่รับครบ ⇒ ไม่รอออกใบ (ออกใบไม่ได้โดยออกแบบ)', () => {
    expect(receiptAwaitsTaxInvoice(base)).toBe(false)
  })

  it('ยังออกใบไม่ครบ / รอบยังไม่รับครบ ⇒ รอออกใบ', () => {
    expect(receiptAwaitsTaxInvoice({ ...base, invoicedBeforeVatSatang: 60_000 })).toBe(true)
    expect(receiptAwaitsTaxInvoice({ ...base, batchFullyPaid: false })).toBe(true)
    expect(receiptAwaitsTaxInvoice({ ...base, billedBeforeVatSatang: null })).toBe(true)
  })

  it('มีใบแล้ว / ใบกำกับแบบเดิมครอบ ⇒ ไม่รอ', () => {
    expect(receiptAwaitsTaxInvoice({ ...base, invoicedBeforeVatSatang: 0, hasActiveInvoice: true })).toBe(false)
    expect(receiptAwaitsTaxInvoice({ ...base, invoicedBeforeVatSatang: 0, coveredByLegacyInvoice: true })).toBe(false)
  })

  it('รอบรับครบที่ข้ามเพราะเงินรับส่วนเพิ่มหนี้ ⇒ กลับมาตรวจได้ (hasReceiptsAwaitingInvoice = false)', () => {
    const result = evaluateTaxInvoiceCoverage([batch({ hasReceiptsAwaitingInvoice: receiptAwaitsTaxInvoice(base) })])
    expect(result.checkedCount).toBe(1)
  })
})

describe('mytester4 G4-03 — การ์ด "ยังไม่ออกใบ" ไม่นับเงินรับที่ไม่ต้องออก (ชำระส่วนใบเพิ่มหนี้)', () => {
  const item = (over: Partial<{ taxInvoice: unknown; coveredByLegacyInvoice: boolean; taxInvoiceNotRequired: boolean }> = {}) => ({
    taxInvoice: null,
    coveredByLegacyInvoice: false,
    taxInvoiceNotRequired: false,
    ...over,
  })

  it('MTJ 20.80 ชำระ DN หลังใบปิดยอด ⇒ ไม่นับ · ยังต้องออก ⇒ นับ · มีใบ/แบบเดิม ⇒ ไม่นับ', () => {
    expect(countReceiptsAwaitingTaxInvoice([item({ taxInvoiceNotRequired: true })])).toBe(0)
    expect(
      countReceiptsAwaitingTaxInvoice([
        item(),
        item({ taxInvoiceNotRequired: true }),
        item({ taxInvoice: { id: 'x' } }),
        item({ coveredByLegacyInvoice: true }),
      ]),
    ).toBe(1)
  })
})

describe('mytester4 H4-01 — ใบกำกับเกินมูลค่าสุทธิของรอบ (ทุกรอบ ไม่จำกัดรับครบ)', () => {
  // BL-2569-003 SPC: ใบแจ้งหนี้ 2,462.51 + 172.38 · ลด 100 + 1,000 ⇒ มูลค่าสุทธิ 1,362.51 · ใบรับ 1,500 = 1,401.87 + 98.13
  // R = 1,060.64 + 74.25 ⇒ ยอดตามเอกสาร 1,500 = รับแล้ว · ส่วนเกิน 39.36 (+2.76) ยังไม่มีใบลดหนี้
  const spc = (overrides: Partial<TaxInvoiceCoverageBatch> = {}): TaxInvoiceCoverageBatch =>
    batch({
      batchNumber: 'BL-2569-003',
      invoiced: { beforeVatSatang: 246_251, vatSatang: 17_238, totalSatang: 263_489 },
      creditNotes: { beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 },
      debitNotes: { beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 },
      taxInvoices: { beforeVatSatang: 140_187, vatSatang: 9_813, totalSatang: 150_000 },
      uninvoicedReduction: { beforeVatSatang: 106_064, vatSatang: 7_425, totalSatang: 113_489 },
      receivedSatang: 150_000,
      customerWhtSatang: 0,
      fullyPaid: false,
      netValueBeforeVatSatang: 246_251 - 110_000,
      ...overrides,
    })

  it('ค้าง AR 0.01 (ยังไม่รับครบ) ⇒ ข้อตรวจเท่ากันพอดีข้าม แต่จับใบกำกับเกิน 39.36 ⇒ เตือน', () => {
    const result = evaluateTaxInvoiceCoverage([spc()])
    expect(result.checkedCount).toBe(0)
    expect(result.mismatches).toEqual([])
    expect(result.overNetValue).toEqual([
      { batchNumber: 'BL-2569-003', netValueBeforeVatSatang: 136_251, documentsBeforeVatSatang: 140_187, excessBeforeVatSatang: 3_936 },
    ])
    const warning = taxInvoiceOverNetValueWarning(result)
    expect(warning).toContain('1 รอบ')
    expect(warning).toContain('BL-2569-003 เกิน ฿39.36 ก่อนภาษี')
    expect(warning).toContain('ปิดงวดได้')
    expect(warning).not.toMatch(/§|`\d/)
  })

  it('รับครบแล้ว (ยอดตามเอกสาร = รับ) ⇒ ข้อตรวจเท่ากันพอดีผ่าน แต่ยังจับใบกำกับเกินได้', () => {
    const result = evaluateTaxInvoiceCoverage([spc({ fullyPaid: true })])
    expect(result.checkedCount).toBe(1)
    expect(result.mismatches).toEqual([])
    expect(result.overNetValue).toHaveLength(1)
  })

  it('ออกใบลดหนี้ส่วนเกิน 39.36 แล้ว ⇒ เอกสารสุทธิ = มูลค่าสุทธิ ⇒ ไม่เตือน', () => {
    const result = evaluateTaxInvoiceCoverage([
      spc({ creditNotes: { beforeVatSatang: 3_936, vatSatang: 275, totalSatang: 4_211 } }),
    ])
    expect(result.overNetValue).toEqual([])
    expect(taxInvoiceOverNetValueWarning(result)).toBeNull()
  })

  it('ใบกำกับต่ำกว่ามูลค่าสุทธิ (ยังรับไม่ครบ) / ไม่มีใบ / ไม่ส่งมูลค่าสุทธิ ⇒ ไม่เตือน', () => {
    expect(taxInvoiceExcessOverNetValue(spc({ netValueBeforeVatSatang: 200_000 }))).toBeNull()
    expect(taxInvoiceExcessOverNetValue(spc({ taxInvoices: ZERO }))).toBeNull()
    expect(taxInvoiceExcessOverNetValue(spc({ netValueBeforeVatSatang: undefined }))).toBeNull()
    expect(taxInvoiceOverNetValueWarning(undefined)).toBeNull()
  })

  it('ใบเพิ่มหนี้บวกทั้งสองฝั่ง ⇒ เพิ่มยอดที่มีใบเพิ่มหนี้ไม่ทำให้เกิน', () => {
    const result = evaluateTaxInvoiceCoverage([
      spc({
        creditNotes: { beforeVatSatang: 3_936, vatSatang: 275, totalSatang: 4_211 },
        debitNotes: { beforeVatSatang: 5_000, vatSatang: 350, totalSatang: 5_350 },
        netValueBeforeVatSatang: 246_251 - 110_000 + 5_000,
      }),
    ])
    expect(result.overNetValue).toEqual([])
  })

  it('อัตรา VAT ของใบต่างจากใบแจ้งหนี้ ⇒ เทียบก่อน VAT ไม่ขึ้นกับ VAT ของใบ', () => {
    // ใบแจ้งหนี้ 1,000 (7%) · ลด 100 ⇒ มูลค่าสุทธิ 900 · ใบรับหลังอัตราเป็น 10% = 950 + 95
    const over = spc({
      invoiced: { beforeVatSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 },
      taxInvoices: { beforeVatSatang: 95_000, vatSatang: 9_500, totalSatang: 104_500 },
      uninvoicedReduction: undefined,
      vatRateDiffers: true,
      netValueBeforeVatSatang: 90_000,
    })
    expect(taxInvoiceExcessOverNetValue(over)?.excessBeforeVatSatang).toBe(5_000)
    expect(taxInvoiceExcessOverNetValue({ ...over, taxInvoices: { beforeVatSatang: 90_000, vatSatang: 9_000, totalSatang: 99_000 } })).toBeNull()
  })

  it('รอบที่ข้อตรวจเท่ากันพอดีจับแล้ว ⇒ ไม่ซ้ำใน overNetValue · รอบที่ไม่มีเงินรับในงวด ⇒ ตรวจเฉพาะเกินมูลค่าสุทธิ', () => {
    const exact = batch({
      taxInvoices: { beforeVatSatang: 300_000, vatSatang: 21_000, totalSatang: 321_000 },
      creditNotes: { beforeVatSatang: 18_692, vatSatang: 1_308, totalSatang: 20_000 },
      netValueBeforeVatSatang: 268_462,
    })
    const first = evaluateTaxInvoiceCoverage([exact])
    expect(first.mismatches).toHaveLength(1)
    expect(first.overNetValue).toEqual([])
    const late = evaluateTaxInvoiceCoverage([spc({ fullyPaid: true, receivedInPeriod: false })])
    expect(late.checkedCount).toBe(0)
    expect(late.overNetValue).toHaveLength(1)
  })
})

describe('รีวิว mytester4 — มูลค่าสุทธิไม่นับรายการ "จัดการนอกระบบ" + เกณฑ์ปัดเศษต่อใบ', () => {
  const waivedAt = new Date('2026-10-12T03:00:00Z')
  const row = (overrides: Partial<Parameters<typeof adjustmentNetByBatch>[0][number]> = {}) => ({
    adjustmentType: 'decrease',
    amountSatang: 10_000,
    batchId: 'b1',
    creditNoteWaivedAt: null,
    creditNoteWaiveReason: null,
    ...overrides,
  })

  it('ลดยอดที่ปิดป้ายจัดการนอกระบบ ⇒ ไม่นับ · ปิดอัตโนมัติเพราะลดในส่วนที่ยังไม่ออกใบ ⇒ ยังนับ · เพิ่มยอดนับเสมอ', () => {
    const net = adjustmentNetByBatch([
      row({ amountSatang: 3_936 }),
      row({ amountSatang: 50_000, creditNoteWaivedAt: waivedAt, creditNoteWaiveReason: 'ออกใบลดหนี้ด้วยมือแล้ว' }),
      row({ amountSatang: 106_064, creditNoteWaivedAt: waivedAt, creditNoteWaiveReason: UNINVOICED_REDUCTION_WAIVE_REASON }),
      row({ adjustmentType: 'increase', amountSatang: 5_000, creditNoteWaivedAt: waivedAt, creditNoteWaiveReason: 'นอกระบบ' }),
      row({ batchId: null, amountSatang: 999 }),
      row({ batchId: 'b2', adjustmentType: 'write_off', amountSatang: 777 }),
    ])
    expect(net.get('b1')).toBe(-3_936 - 106_064 + 5_000)
    expect(net.has('b2')).toBe(false)
  })

  it('ส่วนเกินที่ปิดป้ายนอกระบบแล้วไม่เตือนซ้ำในงวดถัดไป', () => {
    // BL-2569-003: ใบรับ 1,401.87 ก่อน VAT · ลด 1,060.64 (ส่วนที่ยังไม่ออกใบ — ปิดอัตโนมัติ) + 39.36 (จัดการนอกระบบ)
    const adjustments = adjustmentNetByBatch([
      row({ amountSatang: 106_064, creditNoteWaivedAt: waivedAt, creditNoteWaiveReason: UNINVOICED_REDUCTION_WAIVE_REASON }),
      row({ amountSatang: 3_936, creditNoteWaivedAt: waivedAt, creditNoteWaiveReason: 'ออกใบลดหนี้นอกระบบแล้ว' }),
    ])
    const result = evaluateTaxInvoiceCoverage([
      batch({
        batchNumber: 'BL-2569-003',
        invoiced: { beforeVatSatang: 246_251, vatSatang: 17_238, totalSatang: 263_489 },
        taxInvoices: { beforeVatSatang: 140_187, vatSatang: 9_813, totalSatang: 150_000 },
        creditNotes: { beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 },
        debitNotes: { beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 },
        fullyPaid: false,
        netValueBeforeVatSatang: 246_251 + (adjustments.get('b1') ?? 0),
        taxInvoiceCount: 1,
      }),
    ])
    expect(result.overNetValue).toEqual([])
  })

  it('ใบรับชำระบางส่วนหลายใบปัด VAT ทีละใบ ⇒ Σ ก่อน VAT เกินมูลค่าสุทธิ 1 สตางค์ ⇒ อยู่ในเกณฑ์ ไม่เตือน', () => {
    // ใบแจ้งหนี้ 1,000 + 70 · ลด 100 + 7 ในส่วนที่ยังไม่ออกใบ ⇒ มูลค่าสุทธิ 900 (รวม VAT 963)
    // ลูกค้าชำระ 100 × 9 + 62.99 (ยังค้าง 0.01 ⇒ ทุกใบเป็นใบรับบางส่วน ถอด VAT แล้วปัดทีละใบ)
    const basis = { billedBeforeVatSatang: 100_000, billedVatSatang: 7_000, billedVatRatesPct: [7] }
    const prior: PriorInvoiceAmounts[] = []
    const uninvoicedReduction = { beforeVatSatang: 10_000, vatSatang: 700 }
    for (const paid of [...Array<number>(9).fill(10_000), 6_299]) {
      const amounts = receiptInvoiceAmounts({ basis, prior, paidSatang: paid, vatRatePct: 7, uninvoicedReduction })
      expect(amounts.coversRemainder).toBe(false)
      prior.push({
        amountBeforeVatSatang: amounts.totalBeforeVatSatang,
        vatSatang: amounts.vatSatang,
        vatRatePct: 7,
        totalSatang: amounts.totalSatang,
        receivedSatang: paid,
      })
    }
    const invoices = {
      beforeVatSatang: prior.reduce((sum, invoice) => sum + invoice.amountBeforeVatSatang, 0),
      vatSatang: prior.reduce((sum, invoice) => sum + invoice.vatSatang, 0),
      totalSatang: 96_299,
    }
    expect(invoices.beforeVatSatang).toBe(90_001)
    const rounded = batch({
      invoiced: { beforeVatSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 },
      taxInvoices: invoices,
      creditNotes: { beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 },
      debitNotes: { beforeVatSatang: 0, vatSatang: 0, totalSatang: 0 },
      fullyPaid: false,
      netValueBeforeVatSatang: 90_000,
    })
    // ไม่มีเกณฑ์ ⇒ เตือนผิด 0.01 · เกณฑ์ 1 สตางค์ต่อใบ (10 ใบ) ⇒ ไม่เตือน
    expect(taxInvoiceExcessOverNetValue(rounded)?.excessBeforeVatSatang).toBe(1)
    expect(taxInvoiceExcessOverNetValue({ ...rounded, taxInvoiceCount: prior.length })).toBeNull()
    // เกินจริงเกินเกณฑ์ ⇒ ยังเตือน
    expect(
      taxInvoiceExcessOverNetValue({ ...rounded, taxInvoiceCount: prior.length, netValueBeforeVatSatang: 89_990 })
        ?.excessBeforeVatSatang,
    ).toBe(11)
  })
})
