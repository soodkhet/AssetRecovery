import { describe, expect, it } from 'vitest'
import {
  assertInvoiceDateValid,
  assertVatApplicable,
  receiptInvoiceAmounts,
  receiptInvoiceDescriptionOf,
  receiptInstallmentOf,
  replacementNoteOf,
  TAX_INVOICE_DOC_KIND_TITLE,
} from '@/lib/sales/receipt-invoice'

/**
 * ใบเสร็จรับเงิน/ใบกำกับภาษี ตอนรับเงิน — มติ PO 06/10/2569 U95 + U96 #3/#7/#8/#9 (สูตร `22` §6.8.2)
 */

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
  return 'NO_ERROR'
}

const basis = { billedBeforeVatSatang: 1_200_000, billedVatSatang: 84_000, billedVatRatesPct: [7] }
const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

describe('receiptInvoiceAmounts — ยอดบนใบเสร็จรับเงิน/ใบกำกับภาษี', () => {
  it('รับเต็มยอดใบแจ้งหนี้ อัตราเดิม ⇒ ก่อน VAT/VAT ตรงใบแจ้งหนี้เป๊ะ', () => {
    expect(receiptInvoiceAmounts({ basis, prior: [], paidSatang: 1_284_000, vatRatePct: 7 })).toEqual({
      totalBeforeVatSatang: 1_200_000,
      vatSatang: 84_000,
      totalSatang: 1_284_000,
      vatRatePct: 7,
      coversRemainder: true,
      excessSatang: 0,
      bankFeeSatang: 0,
    })
  })

  it('ลูกค้าหัก ณ ที่จ่าย 3% — เงินโอน + ภาษีที่ถูกหัก นับเป็นการรับชำระเต็มยอด', () => {
    const paid = 1_284_000 - 36_000 + 36_000
    expect(receiptInvoiceAmounts({ basis, prior: [], paidSatang: paid, vatRatePct: 7 }).coversRemainder).toBe(true)
  })

  it('รับบางส่วน ⇒ ยอดที่รับเป็นยอดรวม VAT · ใบที่สองปิดยอดคงเหลือ ผลรวมเท่าใบแจ้งหนี้', () => {
    const first = receiptInvoiceAmounts({ basis, prior: [], paidSatang: 500_000, vatRatePct: 7 })
    expect(first.vatSatang).toBe(32_710) // 500,000 × 7/107 = 32,710.28 ⇒ ปัดครึ่งขึ้น
    expect(first.totalBeforeVatSatang).toBe(467_290)
    expect(first.coversRemainder).toBe(false)

    const second = receiptInvoiceAmounts({
      basis,
      prior: [{ amountBeforeVatSatang: first.totalBeforeVatSatang, vatSatang: first.vatSatang, vatRatePct: 7 }],
      paidSatang: 784_000,
      vatRatePct: 7,
    })
    expect(second.coversRemainder).toBe(true)
    expect(first.totalBeforeVatSatang + second.totalBeforeVatSatang).toBe(1_200_000)
    expect(first.vatSatang + second.vatSatang).toBe(84_000)
  })

  it('อัตรา VAT เปลี่ยนระหว่างวางบิลกับรับเงิน (7 → 10) ⇒ คิดตามอัตรา ณ วันรับเงิน', () => {
    // รับเต็มยอดก่อน VAT + VAT ใหม่
    const full = receiptInvoiceAmounts({ basis, prior: [], paidSatang: 1_320_000, vatRatePct: 10 })
    expect(full).toMatchObject({ totalBeforeVatSatang: 1_200_000, vatSatang: 120_000, totalSatang: 1_320_000, vatRatePct: 10 })

    // ลูกค้าโอนยอดตามใบแจ้งหนี้ (อัตราเดิม) ⇒ ยังไม่ครบ ⇒ ออกตามยอดที่รับ ถอด VAT 10%
    const partial = receiptInvoiceAmounts({ basis, prior: [], paidSatang: 1_284_000, vatRatePct: 10 })
    expect(partial.coversRemainder).toBe(false)
    expect(partial.vatSatang).toBe(116_727) // 1,284,000 × 10/110
    expect(partial.totalBeforeVatSatang).toBe(1_167_273)
  })

  it('รับเกินยอดคงเหลือ ⇒ ออกเท่ายอดคงเหลือ + คืนส่วนเกิน', () => {
    const result = receiptInvoiceAmounts({ basis, prior: [], paidSatang: 1_300_000, vatRatePct: 7 })
    expect(result.totalSatang).toBe(1_284_000)
    expect(result.excessSatang).toBe(16_000)
  })

  describe('มติ PO U169 — บิลที่ปิดด้วยการตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร ออกเต็มยอดบิล', () => {
    it('U144 รับขาดไม่เกินเพดาน (ไม่มีภาษีลูกค้าหัก) ⇒ เต็มยอด · VAT จากมูลค่าเต็ม · ส่วนต่างเป็นค่าธรรมเนียม', () => {
      // บิล 12,840.00 · เงินเข้า 12,800.00 · ตัดส่วนต่าง 40.00 เป็นค่าธรรมเนียมธนาคาร
      const result = receiptInvoiceAmounts({
        basis,
        prior: [],
        paidSatang: 1_280_000,
        bankFeeWrittenOffSatang: 4_000,
        vatRatePct: 7,
      })
      expect(result).toEqual({
        totalBeforeVatSatang: 1_200_000,
        vatSatang: 84_000,
        totalSatang: 1_284_000,
        vatRatePct: 7,
        coversRemainder: true,
        excessSatang: 0,
        bankFeeSatang: 4_000,
      })
      expect(receiptInvoiceDescriptionOf({ periodLabel: 'ตุลาคม 2569', billingBatchNumber: 'BL-2569-011', coversRemainder: result.coversRemainder })).not.toContain('บางส่วน')
    })

    it('U163 ภาษีลูกค้าหัก + ค่าโอนในรายการเดียว (BL-2569-011) ⇒ 1,750.03 + VAT 122.50 = 1,872.53 · ค่าธรรมเนียม 20.03', () => {
      const bl011 = { billedBeforeVatSatang: 175_003, billedVatSatang: 12_250, billedVatRatesPct: [7] }
      const result = receiptInvoiceAmounts({
        basis: bl011,
        prior: [],
        paidSatang: 180_000 + 5_250, // เงินเข้า + ภาษีที่ลูกค้าหัก
        bankFeeWrittenOffSatang: 2_003,
        vatRatePct: 7,
      })
      expect(result).toMatchObject({
        totalBeforeVatSatang: 175_003,
        vatSatang: 12_250,
        totalSatang: 187_253,
        coversRemainder: true,
        bankFeeSatang: 2_003,
      })
      // ไม่มียอดคงค้างบนเอกสาร (ใบเดียวครบยอด)
      const installment = receiptInstallmentOf({
        invoiceId: 'inv',
        billedTotalSatang: 187_253,
        invoices: [{ id: 'inv', status: 'active', totalSatang: result.totalSatang, createdAt: day('2026-10-07') }],
      })
      expect(installment).toBeNull()
    })

    it('รับหลายครั้ง — ใบรับบางส่วนไม่ดูดส่วนต่าง · ใบที่ปิดยอดเป็นผู้รับส่วนต่างไม่ว่าออกใบลำดับใด · ผลรวมเท่าบิล', () => {
      // บิล 12,840.00 · รับ 5,000.00 + 7,800.00 · ตัดส่วนต่าง 40.00
      const fee = 4_000
      const lateFirst = receiptInvoiceAmounts({ basis, prior: [], paidSatang: 780_000, bankFeeWrittenOffSatang: fee, vatRatePct: 7 })
      expect(lateFirst).toMatchObject({ totalSatang: 780_000, coversRemainder: false, bankFeeSatang: 0 })
      const closing = receiptInvoiceAmounts({
        basis,
        prior: [{ amountBeforeVatSatang: lateFirst.totalBeforeVatSatang, vatSatang: lateFirst.vatSatang, vatRatePct: 7 }],
        paidSatang: 500_000,
        bankFeeWrittenOffSatang: fee,
        vatRatePct: 7,
      })
      expect(closing).toMatchObject({ coversRemainder: true, bankFeeSatang: fee })
      expect(lateFirst.totalSatang + closing.totalSatang).toBe(1_284_000)
      expect(lateFirst.vatSatang + closing.vatSatang).toBe(84_000)
    })

    it('ไม่มีการตัดส่วนต่าง ⇒ พฤติกรรมเดิม (รับขาด = รับชำระบางส่วน) · ส่วนต่างติดลบ/ทศนิยม ⇒ ปฏิเสธ', () => {
      expect(receiptInvoiceAmounts({ basis, prior: [], paidSatang: 1_280_000, vatRatePct: 7 })).toMatchObject({
        coversRemainder: false,
        totalSatang: 1_280_000,
        bankFeeSatang: 0,
      })
      expect(() =>
        receiptInvoiceAmounts({ basis, prior: [], paidSatang: 1_280_000, bankFeeWrittenOffSatang: -1, vatRatePct: 7 }),
      ).toThrow(RangeError)
    })
  })

  it('ออกครบแล้ว (รวมใบกำกับแบบเดิม) / ยอดรับ 0 ⇒ TAX_INVOICE_NOTHING_TO_INVOICE', () => {
    const legacy = [{ amountBeforeVatSatang: 1_200_000, vatSatang: 84_000, vatRatePct: 7 }]
    expect(codeOf(() => receiptInvoiceAmounts({ basis, prior: legacy, paidSatang: 100, vatRatePct: 7 }))).toBe(
      'TAX_INVOICE_NOTHING_TO_INVOICE',
    )
    expect(codeOf(() => receiptInvoiceAmounts({ basis, prior: [], paidSatang: 0, vatRatePct: 7 }))).toBe(
      'TAX_INVOICE_NOTHING_TO_INVOICE',
    )
  })
})

describe('assertVatApplicable — U96 #3', () => {
  it('บริษัท no_vat / VAT 0 ⇒ TAX_INVOICE_NO_VAT_COMPANY พร้อมข้อความให้ยืนยันกับนักบัญชี', () => {
    let message = ''
    try {
      assertVatApplicable({ vatModes: ['no_vat'], vatRatePct: 7, vatSatang: 0 })
    } catch (error) {
      message = (error as { userMessage: string }).userMessage
    }
    expect(message).toBe('บริษัทนี้ตั้งเป็นไม่มี VAT — ต้องยืนยันกับนักบัญชีก่อน')
    expect(codeOf(() => assertVatApplicable({ vatModes: ['exclude_vat'], vatRatePct: 0, vatSatang: 0 }))).toBe(
      'TAX_INVOICE_NO_VAT_COMPANY',
    )
    expect(codeOf(() => assertVatApplicable({ vatModes: ['exclude_vat'], vatRatePct: 7, vatSatang: 7 }))).toBe('NO_ERROR')
  })
})

describe('assertInvoiceDateValid — U96 #7', () => {
  const today = day('2026-10-06')
  it('วันที่ล่วงหน้า ⇒ TAX_INVOICE_DATE_IN_FUTURE', () => {
    expect(codeOf(() => assertInvoiceDateValid({ invoiceDate: day('2026-10-07'), today, previousInvoiceDate: null }))).toBe(
      'TAX_INVOICE_DATE_IN_FUTURE',
    )
  })
  it('ก่อนวันที่ของเลขก่อนหน้า / ก่อนวันรับเงิน ⇒ TAX_INVOICE_DATE_OUT_OF_SEQUENCE · วันเดียวกันผ่าน', () => {
    expect(
      codeOf(() =>
        assertInvoiceDateValid({
          invoiceDate: day('2026-10-01'),
          today,
          previousInvoiceDate: day('2026-10-02'),
          previousInvoiceNumber: 'INV-0009',
        }),
      ),
    ).toBe('TAX_INVOICE_DATE_OUT_OF_SEQUENCE')
    expect(
      codeOf(() =>
        assertInvoiceDateValid({ invoiceDate: day('2026-10-01'), today, previousInvoiceDate: null, notBefore: day('2026-10-03') }),
      ),
    ).toBe('TAX_INVOICE_DATE_OUT_OF_SEQUENCE')
    expect(
      codeOf(() => assertInvoiceDateValid({ invoiceDate: day('2026-10-02'), today, previousInvoiceDate: day('2026-10-02') })),
    ).toBe('NO_ERROR')
  })
})

describe('ข้อความบนเอกสาร', () => {
  it('ใบแทนพิมพ์เลขเดิม + วันที่ พ.ศ. + เหตุผล (U96 #8)', () => {
    expect(replacementNoteOf({ invoiceNumber: 'INV-0005', invoiceDate: day('2026-10-01'), cancelReason: 'ที่อยู่ผิด' })).toBe(
      'ออกแทนฉบับเลขที่ INV-0005 ลงวันที่ 01/10/2569 เนื่องจาก ที่อยู่ผิด',
    )
    expect(replacementNoteOf(null)).toBeNull()
  })
  it('ชื่อเอกสารตามชนิด + รายละเอียดรับบางส่วน', () => {
    expect(TAX_INVOICE_DOC_KIND_TITLE.receipt_tax_invoice).toBe('ใบเสร็จรับเงิน/ใบกำกับภาษี')
    expect(receiptInvoiceDescriptionOf({ periodLabel: 'กันยายน 2569', billingBatchNumber: 'BL-2569-001', coversRemainder: false })).toBe(
      'ค่าบริการติดตามทรัพย์ รอบเดือน กันยายน 2569 (ใบแจ้งหนี้ BL-2569-001) — รับชำระบางส่วน',
    )
  })
})

describe('receiptInstallmentOf — ลำดับรับชำระบางส่วน (มติ PO U100)', () => {
  const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 20, 3, minute))
  const invoices = [
    { id: 'b', status: 'active' as const, totalSatang: 400_000, createdAt: at(2) },
    { id: 'a', status: 'active' as const, totalSatang: 321_000, createdAt: at(1) },
    { id: 'x', status: 'cancelled' as const, totalSatang: 999_999, createdAt: at(0) },
  ]

  it('ใบแรกรับบางส่วน — ครั้งที่ 1 + คงค้าง = ยอดใบแจ้งหนี้ − ยอดใบนี้ (ใบยกเลิกไม่นับ)', () => {
    expect(receiptInstallmentOf({ invoiceId: 'a', billedTotalSatang: 1_070_000, invoices })).toEqual({
      sequence: 1,
      outstandingSatang: 749_000,
    })
  })

  it('ใบที่สอง — ครั้งที่ 2 + คงค้างหลังรวมทุกใบก่อนหน้า', () => {
    expect(receiptInstallmentOf({ invoiceId: 'b', billedTotalSatang: 1_070_000, invoices })).toEqual({
      sequence: 2,
      outstandingSatang: 349_000,
    })
  })

  it('ใบเดียวรับครบ ⇒ null · ใบที่ยกเลิก/ไม่พบ ⇒ null · คงค้างไม่ติดลบ', () => {
    expect(receiptInstallmentOf({ invoiceId: 'a', billedTotalSatang: 321_000, invoices: invoices.slice(1) })).toBeNull()
    expect(receiptInstallmentOf({ invoiceId: 'x', billedTotalSatang: 1_070_000, invoices })).toBeNull()
    expect(receiptInstallmentOf({ invoiceId: 'zz', billedTotalSatang: 1_070_000, invoices })).toBeNull()
    expect(receiptInstallmentOf({ invoiceId: 'b', billedTotalSatang: 500_000, invoices })).toEqual({
      sequence: 2,
      outstandingSatang: 0,
    })
  })
})
