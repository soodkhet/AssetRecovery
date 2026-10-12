import { describe, expect, it } from 'vitest'
import { assertWithinUninvoicedAllowance } from '@/lib/credit-notes/credit-note'
import { receiptInvoiceAmounts, receiptSettlementOf } from '@/lib/sales/receipt-invoice'
import { evaluateTaxInvoiceCoverage, receiptAwaitsTaxInvoice } from '@/lib/sales/tax-invoice-coverage'
import {
  creditNoteStillRequired,
  decreaseFitsUninvoiced,
  NO_UNINVOICED_REDUCTION,
  reductionVatSatang,
  uninvoicedReductionOf,
  type UninvoicedReductionInput,
} from '@/lib/sales/uninvoiced-reduction'

/**
 * มติผู้ใช้ 12/10/2569 (รีวิว mytester3 R3 #1) — ลดยอดส่วนที่ยังไม่ออกใบกำกับไม่ต้องออกใบลดหนี้
 * ตัวอย่างหลัก: บิล 1,000 (ก่อน VAT) + VAT 70 · รับ 963 (900 + 63) ⇒ ใบกำกับ 900 · ลด 100 ⇒ ไม่ต้องใบลดหนี้ · รับครบ
 */

const BASE: UninvoicedReductionInput = {
  billedBeforeVatSatang: 100_000,
  billedVatSatang: 7_000,
  billedVatRatesPct: [7],
  invoicedBeforeVatSatang: 0,
  creditNoteBeforeVatSatang: 0,
  decreaseSatang: 0,
  legacyInvoice: false,
}

const with_ = (overrides: Partial<UninvoicedReductionInput>) => uninvoicedReductionOf({ ...BASE, ...overrides })

function codeOf(run: () => void): string | null {
  try {
    run()
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

describe('uninvoicedReductionOf', () => {
  it('ลดทั้งหมดในส่วนที่ยังไม่ออกใบ (บิล 1,000 ออกใบ 900 ลด 100) ⇒ R = 100 + VAT 7 · ใบลดหนี้ที่ออกได้ = 0', () => {
    const result = with_({ invoicedBeforeVatSatang: 90_000, decreaseSatang: 10_000 })
    expect(result).toEqual({
      beforeVatSatang: 10_000,
      vatSatang: 700,
      totalSatang: 10_700,
      remainingBeforeVatSatang: 0,
      creditNoteAllowanceBeforeVatSatang: 0,
    })
    expect(creditNoteStillRequired(result.creditNoteAllowanceBeforeVatSatang)).toBe(false)
  })

  it('ลดบางส่วนข้ามไปส่วนที่ออกใบแล้ว (ออกใบ 900 ลด 300) ⇒ R = 100 · ใบลดหนี้ได้เฉพาะส่วนเกิน 200', () => {
    const result = with_({ invoicedBeforeVatSatang: 90_000, decreaseSatang: 30_000 })
    expect(result.beforeVatSatang).toBe(10_000)
    expect(result.creditNoteAllowanceBeforeVatSatang).toBe(20_000)
    expect(creditNoteStillRequired(result.creditNoteAllowanceBeforeVatSatang)).toBe(true)
    // หลังบันทึกใบลดหนี้ 200 ⇒ R คงเดิม (ไม่หักซ้ำ) · ไม่ต้องลดหนี้อีก
    const after = with_({ invoicedBeforeVatSatang: 90_000, decreaseSatang: 30_000, creditNoteBeforeVatSatang: 20_000 })
    expect(after.beforeVatSatang).toBe(10_000)
    expect(after.creditNoteAllowanceBeforeVatSatang).toBe(0)
  })

  it('บิลยังไม่มีใบกำกับเลย (G-02) ⇒ ลดทั้งก้อนไม่ต้องใบลดหนี้ · ยอดที่ยังออกใบได้ = ยอดหลังลด', () => {
    const result = with_({ decreaseSatang: 10_000 })
    expect(result.beforeVatSatang).toBe(10_000)
    expect(result.remainingBeforeVatSatang).toBe(90_000)
    expect(result.creditNoteAllowanceBeforeVatSatang).toBe(0)
  })

  it('รับครบแล้ว (ออกใบครบรอบ) ⇒ R = 0 · กติกาเดิม: ต้องใบลดหนี้เต็ม (ไม่จำกัดด้วยกติกานี้)', () => {
    const result = with_({ invoicedBeforeVatSatang: 100_000, decreaseSatang: 10_000 })
    expect(result.beforeVatSatang).toBe(0)
    expect(result.creditNoteAllowanceBeforeVatSatang).toBeNull()
    expect(creditNoteStillRequired(result.creditNoteAllowanceBeforeVatSatang)).toBe(true)
  })

  it('ใบกำกับแบบเดิม (ออกตอนวางบิล) ⇒ ไม่ใช้กติกานี้', () => {
    expect(with_({ legacyInvoice: true, decreaseSatang: 10_000 })).toBe(NO_UNINVOICED_REDUCTION)
  })

  it('ข้อมูลเดิม: ใบลดหนี้ที่ลดส่วนยังไม่ออกใบ (G3-01) นับก่อน ⇒ ไม่หักซ้ำ', () => {
    // บิล 1,000 · ใบกำกับ 600 · ลด 200 พร้อมใบลดหนี้ 200 ⇒ R = 0 (เครดิตใบลดหนี้ทำงานตามเดิม)
    const result = with_({ invoicedBeforeVatSatang: 60_000, decreaseSatang: 20_000, creditNoteBeforeVatSatang: 20_000 })
    expect(result.beforeVatSatang).toBe(0)
    expect(result.remainingBeforeVatSatang).toBe(40_000)
  })

  it('R ไม่เกินมูลค่าที่ยังไม่ออกใบ · ลดเกินบิลไม่ติดลบ', () => {
    const result = with_({ invoicedBeforeVatSatang: 30_000, decreaseSatang: 500_000 })
    expect(result.beforeVatSatang).toBe(70_000)
    expect(result.remainingBeforeVatSatang).toBe(0)
  })

  it('VAT: อัตราเดียว ⇒ ตัวคูณกลาง · หลายอัตรา ⇒ สัดส่วนใบแจ้งหนี้ปัดครึ่งขึ้น · ไม่มี VAT ⇒ 0', () => {
    expect(reductionVatSatang(10_050, BASE)).toBe(704)
    expect(
      reductionVatSatang(10_000, { billedBeforeVatSatang: 200_000, billedVatSatang: 10_000, billedVatRatesPct: [7, 3] }),
    ).toBe(500)
    expect(reductionVatSatang(10_000, { billedBeforeVatSatang: 100_000, billedVatSatang: 0, billedVatRatesPct: [] })).toBe(0)
  })

  it('ยอดไม่ใช่สตางค์จำนวนเต็มไม่ติดลบ ⇒ RangeError', () => {
    expect(() => with_({ decreaseSatang: -1 })).toThrow(RangeError)
    expect(() => with_({ invoicedBeforeVatSatang: 1.5 })).toThrow(RangeError)
  })
})

describe('decreaseFitsUninvoiced (ปิดอัตโนมัติตอนอนุมัติ)', () => {
  it('ลดไม่เกินส่วนที่ยังไม่ออกใบ ⇒ ปิดแบบไม่ต้องใบลดหนี้ · เกิน ⇒ รอใบลดหนี้ · ใบแบบเดิม ⇒ ไม่ปิด', () => {
    const before = with_({ invoicedBeforeVatSatang: 90_000 })
    expect(decreaseFitsUninvoiced(10_000, before)).toBe(true)
    expect(decreaseFitsUninvoiced(10_001, before)).toBe(false)
    expect(decreaseFitsUninvoiced(10_000, NO_UNINVOICED_REDUCTION)).toBe(false)
    expect(decreaseFitsUninvoiced(0, before)).toBe(false)
  })
})

describe('assertWithinUninvoicedAllowance (ฝั่งบันทึกใบลดหนี้)', () => {
  const note = (beforeVat: number) => ({ amountBeforeVatSatang: beforeVat, vatSatang: 0, totalSatang: beforeVat })

  it('ส่วนที่ออกใบแล้วเกินมูลค่าใหม่ = 0 ⇒ ใบลดหนี้ 100 ไม่ได้ พร้อมข้อความ "ไม่ต้องออกใบลดหนี้"', () => {
    let message = ''
    try {
      assertWithinUninvoicedAllowance(0, note(10_000))
    } catch (error) {
      message = String((error as Error).message)
      expect((error as { code?: string }).code).toBe('CREDIT_NOTE_EXCEEDS_OUTSTANDING')
    }
    expect(message).toContain('ส่วนที่ลดยังไม่ได้ออกใบกำกับภาษี ไม่ต้องออกใบลดหนี้')
  })

  it('ลดได้เฉพาะส่วนเกิน 200 · null = กติกาเดิม', () => {
    expect(codeOf(() => assertWithinUninvoicedAllowance(20_000, note(20_000)))).toBeNull()
    expect(codeOf(() => assertWithinUninvoicedAllowance(20_000, note(20_001)))).toBe('CREDIT_NOTE_EXCEEDS_OUTSTANDING')
    expect(codeOf(() => assertWithinUninvoicedAllowance(null, note(999_999)))).toBeNull()
  })
})

describe('ใบเสร็จรับเงิน/ใบกำกับภาษี + ส่วนที่ลดก่อนออกใบ', () => {
  const basis = { billedBeforeVatSatang: 100_000, billedVatSatang: 7_000, billedVatRatesPct: [7] }

  it('ไม่รวม VAT: G-02 ลด 100 ก่อนรับ ⇒ รับ 963 = ใบปิดยอด 900 + 63 · Σ ใบ = ยอดสุทธิ', () => {
    const reduction = with_({ decreaseSatang: 10_000 })
    const result = receiptInvoiceAmounts({ basis, prior: [], paidSatang: 96_300, vatRatePct: 7, uninvoicedReduction: reduction })
    expect(result).toMatchObject({ totalBeforeVatSatang: 90_000, vatSatang: 6_300, totalSatang: 96_300, coversRemainder: true })
  })

  it('หลายรอบรับ: ใบแรก 535 (500+35) · ลด 100 · รับ 428 ⇒ ใบปิดยอด 400 + 28 · ไม่มียอดค้างบน PDF', () => {
    const first = receiptInvoiceAmounts({ basis, prior: [], paidSatang: 53_500, vatRatePct: 7 })
    expect(first).toMatchObject({ totalBeforeVatSatang: 50_000, vatSatang: 3_500, coversRemainder: false })
    const prior = [{ amountBeforeVatSatang: 50_000, vatSatang: 3_500, vatRatePct: 7, totalSatang: 53_500, receivedSatang: 53_500 }]
    const reduction = with_({ invoicedBeforeVatSatang: 50_000, decreaseSatang: 10_000 })
    const last = receiptInvoiceAmounts({ basis, prior, paidSatang: 42_800, vatRatePct: 7, uninvoicedReduction: reduction })
    expect(last).toMatchObject({ totalBeforeVatSatang: 40_000, vatSatang: 2_800, totalSatang: 42_800, coversRemainder: true })
    // Σ ใบ = ใบแจ้งหนี้ − ส่วนที่ลด (ก่อน VAT และ VAT)
    expect(first.totalBeforeVatSatang + last.totalBeforeVatSatang).toBe(100_000 - reduction.beforeVatSatang)
    expect(first.vatSatang + last.vatSatang).toBe(7_000 - reduction.vatSatang)

    const settlement = receiptSettlementOf({
      invoiceId: 'b',
      billedTotalSatang: 107_000,
      uninvoicedReductionTotalSatang: reduction.totalSatang,
      invoices: [
        { id: 'a', status: 'active', totalSatang: 53_500, createdAt: new Date(1), receivedSatang: 53_500 },
        { id: 'b', status: 'active', totalSatang: 42_800, createdAt: new Date(2), receivedSatang: 42_800 },
      ],
    })
    expect(settlement).toMatchObject({ sequence: 2, outstandingSatang: 0, bankFeeSatang: 0, creditAppliedSatang: 0 })
  })

  it('รับครบแล้วลดภายหลัง (ใบปิดยอดเต็มบิล) ⇒ หลังลดไม่มีมูลค่าให้ออกใบ (ต้องใบลดหนี้ตามเดิม)', () => {
    const prior = [{ amountBeforeVatSatang: 100_000, vatSatang: 7_000, vatRatePct: 7 }]
    const reduction = with_({ invoicedBeforeVatSatang: 100_000, decreaseSatang: 10_000 })
    expect(reduction.beforeVatSatang).toBe(0)
    expect(() => receiptInvoiceAmounts({ basis, prior, paidSatang: 100, vatRatePct: 7, uninvoicedReduction: reduction })).toThrow()
  })

  it('รวม VAT (include_vat): ใบแจ้งหนี้ 1,070 (1,000 + 70) ลด 100 ก่อนรับ ⇒ รับ 963 ปิดยอดพอดี', () => {
    // โหมดรวม VAT ต่างกันแค่ snapshot รายได้ — ฐานใบแจ้งหนี้เป็นก่อน VAT/VAT แยกแล้ว ⇒ สูตรเดียวกัน
    const includeBasis = { billedBeforeVatSatang: 93_458, billedVatSatang: 6_542, billedVatRatesPct: [7] }
    const reduction = uninvoicedReductionOf({ ...BASE, ...includeBasis, decreaseSatang: 9_346 })
    expect(reduction).toMatchObject({ beforeVatSatang: 9_346, vatSatang: 654, totalSatang: 10_000 })
    const result = receiptInvoiceAmounts({
      basis: includeBasis,
      prior: [],
      paidSatang: 90_000,
      vatRatePct: 7,
      uninvoicedReduction: reduction,
    })
    expect(result).toMatchObject({ totalBeforeVatSatang: 84_112, vatSatang: 5_888, totalSatang: 90_000, coversRemainder: true })
  })

  it('ส่วนที่ลดติดลบ/ไม่ใช่จำนวนเต็ม ⇒ RangeError', () => {
    expect(() =>
      receiptInvoiceAmounts({ basis, prior: [], paidSatang: 100, vatRatePct: 7, uninvoicedReduction: { beforeVatSatang: -1, vatSatang: 0 } }),
    ).toThrow(RangeError)
  })
})

describe('H3-02 ใบกำกับครอบยอด — ปิดแบบไม่ต้องใบลดหนี้ไม่เตือนผิด', () => {
  const batch = {
    batchNumber: 'BL-T',
    invoiced: { beforeVatSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 },
    creditNotes: { vatSatang: 0, totalSatang: 0 },
    debitNotes: { vatSatang: 0, totalSatang: 0 },
    taxInvoices: { beforeVatSatang: 90_000, vatSatang: 6_300, totalSatang: 96_300 },
    receivedSatang: 96_300,
    customerWhtSatang: 0,
    bankFeeSatang: 0,
    fullyPaid: true,
    hasReceiptsAwaitingInvoice: false,
  }

  it('บิล 1,070 ใบกำกับ 963 ลด 107 (ไม่ต้องใบลดหนี้) ⇒ ไม่มีรอบที่ไม่ครอบ', () => {
    const result = evaluateTaxInvoiceCoverage([
      { ...batch, uninvoicedReduction: { beforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700 } },
    ])
    expect(result.mismatches).toEqual([])
    expect(result.differenceSatang).toBe(0)
  })

  it('ไม่ส่งส่วนที่ลด (พฤติกรรมเดิม) ⇒ เตือนว่าใบกำกับขาด 107', () => {
    expect(evaluateTaxInvoiceCoverage([batch]).mismatches[0]?.differenceSatang).toBe(10_700)
  })

  it('เงินรับหลังใบปิดยอด (ออกครบยอดหลังลดแล้ว) ⇒ ไม่นับ "รอออกใบ"', () => {
    const input = {
      hasActiveInvoice: false,
      coveredByLegacyInvoice: false,
      batchFullyPaid: true,
      invoicedBeforeVatSatang: 90_000,
      billedBeforeVatSatang: 100_000,
    }
    expect(receiptAwaitsTaxInvoice(input)).toBe(true)
    expect(receiptAwaitsTaxInvoice({ ...input, uninvoicedReductionBeforeVatSatang: 10_000 })).toBe(false)
  })
})
