import { describe, expect, it } from 'vitest'
import {
  assertInvoiceDateValid,
  assertVatApplicable,
  receiptInvoiceAmounts,
  receiptInvoiceDescriptionOf,
  receiptInstallmentOf,
  receiptSettlementOf,
  replacementNoteOf,
  unappliedCreditNoteSatang,
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
      creditAppliedSatang: 0,
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
        creditAppliedSatang: 0,
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

describe('มติ 12/10/2569 G3-01 — ใบลดหนี้ระหว่างรับชำระบางส่วน: ใบถัดไปนับเครดิตจากใบลดหนี้', () => {
  /** ผลรวมสุทธิของรอบ: Σ ใบกำกับ − Σ ใบลดหนี้ + Σ ใบเพิ่มหนี้ */
  const sum = (rows: readonly { totalBeforeVatSatang: number; vatSatang: number; totalSatang: number }[]) =>
    rows.reduce(
      (acc, row) => ({
        before: acc.before + row.totalBeforeVatSatang,
        vat: acc.vat + row.vatSatang,
        total: acc.total + row.totalSatang,
      }),
      { before: 0, vat: 0, total: 0 },
    )
  const priorOf = (
    invoice: { totalBeforeVatSatang: number; vatSatang: number; totalSatang: number },
    receivedSatang: number,
    creditNoteTotalSatang = 0,
  ) => ({
    amountBeforeVatSatang: invoice.totalBeforeVatSatang,
    vatSatang: invoice.vatSatang,
    totalSatang: invoice.totalSatang,
    vatRatePct: 7,
    receivedSatang,
    creditNoteTotalSatang,
  })

  // NDP (รวม VAT) — BL-2569-002: 2,871.54 + VAT 201.01 = 3,072.55
  const ndp = { billedBeforeVatSatang: 287_154, billedVatSatang: 20_101, billedVatRatesPct: [7] }
  // MTJ (ไม่รวม VAT) — 10,000.00 + VAT 700.00 = 10,700.00
  const mtj = { billedBeforeVatSatang: 1_000_000, billedVatSatang: 70_000, billedVatRatesPct: [7] }

  it('ไม่มีใบลดหนี้ ⇒ เครดิต 0 · พฤติกรรมเดิมทุกสตางค์', () => {
    const first = receiptInvoiceAmounts({ basis: ndp, prior: [], paidSatang: 200_000, vatRatePct: 7 })
    expect(first).toMatchObject({ totalSatang: 200_000, vatSatang: 13_084, creditAppliedSatang: 0, coversRemainder: false })
    expect(unappliedCreditNoteSatang([priorOf(first, 200_000)])).toBe(0)
    const last = receiptInvoiceAmounts({ basis: ndp, prior: [priorOf(first, 200_000)], paidSatang: 107_255, vatRatePct: 7 })
    expect(last).toMatchObject({ totalSatang: 107_255, coversRemainder: true, creditAppliedSatang: 0, bankFeeSatang: 0 })
  })

  it('BL-2569-002 — ใบลดหนี้ 200 ก่อนรับครั้งสุดท้าย (รับ 786.40 + ลูกค้าหัก 86.15) ⇒ ใบปิดยอด 1,002.38 + 70.17 = 1,072.55', () => {
    const first = receiptInvoiceAmounts({ basis: ndp, prior: [], paidSatang: 200_000, vatRatePct: 7 })
    expect(first).toMatchObject({ totalBeforeVatSatang: 186_916, vatSatang: 13_084 })
    const cn = { totalBeforeVatSatang: 18_692, vatSatang: 1_308, totalSatang: 20_000 }

    const last = receiptInvoiceAmounts({
      basis: ndp,
      prior: [priorOf(first, 200_000, cn.totalSatang)],
      paidSatang: 78_640 + 8_615,
      vatRatePct: 7,
    })
    expect(last).toEqual({
      totalBeforeVatSatang: 100_238,
      vatSatang: 7_017,
      totalSatang: 107_255,
      vatRatePct: 7,
      coversRemainder: true,
      excessSatang: 0,
      bankFeeSatang: 0,
      creditAppliedSatang: 20_000,
    })
    // รอบรับชำระครบ ⇒ Σ ใบกำกับ − ใบลดหนี้ = ยอดสุทธิของรอบ (3,072.55 − 200) ทุกช่อง
    const invoices = sum([first, last])
    expect(invoices.total - cn.totalSatang).toBe(307_255 - 20_000)
    expect(invoices.before - cn.totalBeforeVatSatang).toBe(287_154 - 18_692)
    expect(invoices.vat - cn.vatSatang).toBe(20_101 - 1_308)
  })

  it('รับหลายครั้งหลังใบลดหนี้ (ไม่รวม VAT) ⇒ ใบแรกหลังลดหนี้รวมเครดิตครั้งเดียว · ใบถัดไปไม่นับซ้ำ', () => {
    const first = receiptInvoiceAmounts({ basis: mtj, prior: [], paidSatang: 500_000, vatRatePct: 7 })
    const cn = { totalBeforeVatSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 }
    const second = receiptInvoiceAmounts({
      basis: mtj,
      prior: [priorOf(first, 500_000, cn.totalSatang)],
      paidSatang: 200_000,
      vatRatePct: 7,
    })
    expect(second).toMatchObject({ totalSatang: 307_000, vatSatang: 20_084, coversRemainder: false, creditAppliedSatang: 107_000 })
    const prior2 = [priorOf(first, 500_000, cn.totalSatang), priorOf(second, 200_000)]
    expect(unappliedCreditNoteSatang(prior2)).toBe(0)

    // ลูกค้าหัก ณ ที่จ่าย 3% ของฐานก่อน VAT ที่เหลือ: เงินโอน 2,551.10 + ภาษีที่ถูกหัก 78.90 = 2,630.00
    const third = receiptInvoiceAmounts({ basis: mtj, prior: prior2, paidSatang: 255_110 + 7_890, vatRatePct: 7 })
    expect(third).toMatchObject({ totalSatang: 263_000, coversRemainder: true, creditAppliedSatang: 0, excessSatang: 0 })
    const invoices = sum([first, second, third])
    expect(invoices.total).toBe(1_070_000)
    expect(invoices.vat - cn.vatSatang).toBe(70_000 - 7_000)
  })

  it('ใบลดหนี้หลายใบ (อ้างคนละใบ) ⇒ เครดิตรวมกัน · ใบที่ไม่ผูกเงินรับ (ใบกำกับแบบเดิม) ไม่นับเป็นเครดิต', () => {
    const a = receiptInvoiceAmounts({ basis: mtj, prior: [], paidSatang: 300_000, vatRatePct: 7 })
    const b = receiptInvoiceAmounts({ basis: mtj, prior: [priorOf(a, 300_000)], paidSatang: 300_000, vatRatePct: 7 })
    const prior = [priorOf(a, 300_000, 10_700), priorOf(b, 300_000, 21_400)]
    expect(unappliedCreditNoteSatang(prior)).toBe(32_100)
    expect(unappliedCreditNoteSatang([{ ...priorOf(a, 300_000, 10_700), receivedSatang: null }])).toBe(0)

    const last = receiptInvoiceAmounts({ basis: mtj, prior, paidSatang: 470_000 - 32_100, vatRatePct: 7 })
    expect(last).toMatchObject({ totalSatang: 470_000, coversRemainder: true, creditAppliedSatang: 32_100 })
    expect(sum([a, b, last]).total - 32_100).toBe(1_070_000 - 32_100)
  })

  it('เครดิต + ค่าธรรมเนียมที่ตัดในใบปิดยอด ⇒ เครดิตนับก่อน ส่วนที่เหลือเป็นค่าธรรมเนียม · เครดิตเกินยอดคงเหลือไม่ออกเกิน', () => {
    const first = receiptInvoiceAmounts({ basis: mtj, prior: [], paidSatang: 500_000, vatRatePct: 7 })
    const last = receiptInvoiceAmounts({
      basis: mtj,
      prior: [priorOf(first, 500_000, 107_000)],
      paidSatang: 570_000 - 107_000 - 2_000,
      bankFeeWrittenOffSatang: 2_000,
      vatRatePct: 7,
    })
    expect(last).toMatchObject({ totalSatang: 570_000, coversRemainder: true, creditAppliedSatang: 107_000, bankFeeSatang: 2_000 })

    const capped = receiptInvoiceAmounts({
      basis: mtj,
      prior: [priorOf(first, 500_000, 107_000)],
      paidSatang: 500_000,
      vatRatePct: 7,
    })
    expect(capped).toMatchObject({ totalSatang: 570_000, creditAppliedSatang: 70_000, excessSatang: 0, bankFeeSatang: 0 })
  })

  it('ใบลดหนี้หลังรอบรับชำระครบแล้ว ⇒ ไม่มีมูลค่าให้ออกใบเพิ่ม (TAX_INVOICE_NOTHING_TO_INVOICE)', () => {
    const full = receiptInvoiceAmounts({ basis: mtj, prior: [], paidSatang: 1_070_000, vatRatePct: 7 })
    expect(
      codeOf(() =>
        receiptInvoiceAmounts({ basis: mtj, prior: [priorOf(full, 1_070_000, 10_700)], paidSatang: 100, vatRatePct: 7 }),
      ),
    ).toBe('TAX_INVOICE_NOTHING_TO_INVOICE')
  })

  it('ใบเพิ่มหนี้ (เอกสารภาษีในตัว) ⇒ เงินที่ชำระส่วนเพิ่มหนี้ไม่ออกใบซ้ำ: ใบปิดยอดเท่ายอดคงเหลือ ส่วนเพิ่มหนี้เป็นส่วนเกิน', () => {
    const first = receiptInvoiceAmounts({ basis: mtj, prior: [], paidSatang: 500_000, vatRatePct: 7 })
    const dn = { totalBeforeVatSatang: 2_000, vatSatang: 140, totalSatang: 2_140 } // BL-2569-005 แบบ DN 21.40
    // ใบเพิ่มหนี้ไม่ใช่เครดิต — prior ไม่นับยอดใบเพิ่มหนี้
    const last = receiptInvoiceAmounts({ basis: mtj, prior: [priorOf(first, 500_000)], paidSatang: 570_000 + dn.totalSatang, vatRatePct: 7 })
    expect(last).toMatchObject({ totalSatang: 570_000, coversRemainder: true, excessSatang: 2_140, creditAppliedSatang: 0 })
    // รอบครบ ⇒ Σ ใบกำกับ + ใบเพิ่มหนี้ = ยอดสุทธิของรอบ
    expect(sum([first, last]).total + dn.totalSatang).toBe(1_070_000 + 2_140)
    expect(sum([first, last]).vat + dn.vatSatang).toBe(70_000 + 140)

    // จ่ายส่วนเพิ่มหนี้แยกหลังใบปิดยอด ⇒ ไม่มียอดให้ออกใบ (ใบเพิ่มหนี้คือเอกสารภาษีของส่วนนั้น)
    const closed = [priorOf(first, 500_000), priorOf(last, 570_000)]
    expect(codeOf(() => receiptInvoiceAmounts({ basis: mtj, prior: closed, paidSatang: 2_140, vatRatePct: 7 }))).toBe(
      'TAX_INVOICE_NOTHING_TO_INVOICE',
    )
  })
})

describe('receiptSettlementOf — ยอดค้างจริงหลังใบลดหนี้/ใบเพิ่มหนี้ (มติ 12/10/2569 G3-01)', () => {
  const at = (minute: number): Date => new Date(Date.UTC(2026, 9, 12, 3, minute))
  const cn = (total: number, minute: number) => ({
    noteType: 'credit' as const,
    status: 'active' as const,
    totalSatang: total,
    createdAt: at(minute),
  })

  it('BL-2569-002 — ใบปิดยอดพิมพ์ "ครั้งที่ 2 (ครบยอด)" ไม่มียอดค้าง · แถวหักเครดิต 200 · ใบแรกพิมพ์ซ้ำได้ยอดค้างเดิม', () => {
    const input = {
      billedTotalSatang: 307_255,
      invoices: [
        { id: 'iv1', status: 'active' as const, totalSatang: 200_000, createdAt: at(1), receivedSatang: 200_000 },
        { id: 'iv3', status: 'active' as const, totalSatang: 107_255, createdAt: at(3), receivedSatang: 87_255 },
      ],
      notes: [cn(20_000, 2), { ...cn(5_000, 2), status: 'cancelled' as const }],
    }
    expect(receiptSettlementOf({ ...input, invoiceId: 'iv3' })).toEqual({
      sequence: 2,
      outstandingSatang: 0,
      bankFeeSatang: 0,
      creditAppliedSatang: 20_000,
    })
    expect(receiptInstallmentOf({ ...input, invoiceId: 'iv3' })).toEqual({ sequence: 2, outstandingSatang: 0 })
    // ใบลดหนี้บันทึกหลังใบแรก ⇒ ใบแรกยังพิมพ์ยอดค้าง ณ ตอนออก
    expect(receiptInstallmentOf({ ...input, invoiceId: 'iv1' })).toEqual({ sequence: 1, outstandingSatang: 107_255 })
  })

  it('ข้อมูลเดิมบน staging (ใบสุดท้ายออกเท่าเงินรับ 872.55) ⇒ ยอดค้างจริง 0 · ไม่มีแถวหักเครดิต', () => {
    const settlement = receiptSettlementOf({
      invoiceId: 'iv3',
      billedTotalSatang: 307_255,
      invoices: [
        { id: 'iv1', status: 'active', totalSatang: 200_000, createdAt: at(1), receivedSatang: 200_000 },
        { id: 'iv3', status: 'active', totalSatang: 87_255, createdAt: at(3), receivedSatang: 87_255 },
      ],
      notes: [cn(20_000, 2)],
    })
    expect(settlement).toMatchObject({ sequence: 2, outstandingSatang: 0, creditAppliedSatang: 0 })
  })

  it('รับบางส่วนหลังใบลดหนี้ ⇒ ยอดค้าง = ยอดตามเอกสาร − ที่รับ · ใบเพิ่มหนี้เพิ่มยอดค้าง', () => {
    const invoices = [
      { id: 'a', status: 'active' as const, totalSatang: 500_000, createdAt: at(1), receivedSatang: 500_000 },
      { id: 'b', status: 'active' as const, totalSatang: 307_000, createdAt: at(3), receivedSatang: 200_000 },
    ]
    expect(receiptSettlementOf({ invoiceId: 'b', billedTotalSatang: 1_070_000, invoices, notes: [cn(107_000, 2)] })).toEqual({
      sequence: 2,
      outstandingSatang: 263_000,
      bankFeeSatang: 0,
      creditAppliedSatang: 107_000,
    })
    const dn = { noteType: 'debit' as const, status: 'active' as const, totalSatang: 2_140, createdAt: at(2) }
    expect(
      receiptInstallmentOf({ invoiceId: 'a', billedTotalSatang: 1_070_000, invoices: invoices.slice(0, 1), notes: [{ ...dn, createdAt: at(0) }] }),
    ).toEqual({ sequence: 1, outstandingSatang: 572_140 })
    // ใบปิดยอดที่รับส่วนเพิ่มหนี้ด้วย ⇒ ไม่มียอดค้าง
    const closing = [
      invoices[0]!,
      { id: 'c', status: 'active' as const, totalSatang: 570_000, createdAt: at(3), receivedSatang: 572_140 },
    ]
    expect(receiptInstallmentOf({ invoiceId: 'c', billedTotalSatang: 1_070_000, invoices: closing, notes: [dn] })).toEqual({
      sequence: 2,
      outstandingSatang: 0,
    })
  })

  it('ใบปิดยอดที่มีทั้งเครดิตและค่าธรรมเนียมที่ตัด ⇒ แยกแถวถูก · ใบรับบางส่วนไม่รับค่าธรรมเนียม', () => {
    const invoices = [
      { id: 'a', status: 'active' as const, totalSatang: 500_000, createdAt: at(1), receivedSatang: 500_000 },
      { id: 'b', status: 'active' as const, totalSatang: 570_000, createdAt: at(3), receivedSatang: 461_000 },
    ]
    const input = { billedTotalSatang: 1_070_000, bankFeeWrittenOffSatang: 2_000, invoices, notes: [cn(107_000, 2)] }
    expect(receiptSettlementOf({ ...input, invoiceId: 'b' })).toEqual({
      sequence: 2,
      outstandingSatang: 0,
      bankFeeSatang: 2_000,
      creditAppliedSatang: 107_000,
    })
    expect(receiptSettlementOf({ ...input, invoiceId: 'a' })).toMatchObject({ bankFeeSatang: 0, creditAppliedSatang: 0 })
  })

  it('รีวิว mytester3 #3 — รับ 428 → รับ 588.50 ตัดค่าธรรมเนียม 53.50 → ลดหนี้ 107 อ้างใบแรก ⇒ ใบปิดยอด: เครดิต 53.50 ค่าธรรมเนียม 0 (ลำดับเดียวกับตอนออก)', () => {
    const mtj = { billedBeforeVatSatang: 100_000, billedVatSatang: 7_000, billedVatRatesPct: [7] }
    const first = receiptInvoiceAmounts({ basis: mtj, prior: [], paidSatang: 42_800, vatRatePct: 7 })
    expect(first).toMatchObject({ totalSatang: 42_800, coversRemainder: false })
    // ออกใบปิดยอดหลังบันทึกใบลดหนี้ 107 ที่อ้างใบแรก (ลูกค้าชำระใบแรกเต็มแล้ว)
    const closing = receiptInvoiceAmounts({
      basis: mtj,
      prior: [
        {
          amountBeforeVatSatang: first.totalBeforeVatSatang,
          vatSatang: first.vatSatang,
          vatRatePct: 7,
          totalSatang: first.totalSatang,
          receivedSatang: 42_800,
          creditNoteTotalSatang: 10_700,
        },
      ],
      paidSatang: 58_850,
      bankFeeWrittenOffSatang: 5_350,
      vatRatePct: 7,
    })
    expect(closing).toMatchObject({ totalSatang: 64_200, coversRemainder: true, creditAppliedSatang: 5_350, bankFeeSatang: 0 })

    const ledger = {
      billedTotalSatang: 107_000,
      bankFeeWrittenOffSatang: 5_350,
      invoices: [
        { id: 'a', status: 'active' as const, totalSatang: 42_800, createdAt: at(1), receivedSatang: 42_800 },
        { id: 'b', status: 'active' as const, totalSatang: closing.totalSatang, createdAt: at(3), receivedSatang: 58_850 },
      ],
      notes: [{ ...cn(10_700, 2), taxInvoiceId: 'a' }],
    }
    expect(receiptSettlementOf({ ...ledger, invoiceId: 'b' })).toMatchObject({
      sequence: 2,
      bankFeeSatang: closing.bankFeeSatang,
      creditAppliedSatang: closing.creditAppliedSatang,
    })
  })

  it('ใบลดหนี้ที่อ้างใบกำกับแบบเดิม (ไม่ผูกเงินรับ) / บันทึกหลังใบปิดยอด ไม่นับเป็นเครดิตของใบปิดยอด', () => {
    const invoices = [
      { id: 'old', status: 'active' as const, totalSatang: 50_000, createdAt: at(1), receivedSatang: null },
      { id: 'b', status: 'active' as const, totalSatang: 57_000, createdAt: at(3), receivedSatang: 55_000 },
    ]
    const input = { billedTotalSatang: 107_000, bankFeeWrittenOffSatang: 2_000, invoices }
    expect(receiptSettlementOf({ ...input, invoiceId: 'b', notes: [{ ...cn(5_000, 2), taxInvoiceId: 'old' }] })).toMatchObject({
      bankFeeSatang: 2_000,
      creditAppliedSatang: 0,
    })
    expect(receiptSettlementOf({ ...input, invoiceId: 'b', notes: [{ ...cn(5_000, 4), taxInvoiceId: 'b' }] })).toMatchObject({
      bankFeeSatang: 2_000,
      creditAppliedSatang: 0,
    })
  })
})
