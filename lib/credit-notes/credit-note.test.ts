import { describe, expect, it } from 'vitest'
import {
  adjustmentAmountMismatch,
  canWaiveAwaitingCreditNote,
  closingCreditNoteVatSatang,
  assertAdjustmentLinkable,
  assertCreditNoteCancellable,
  assertInvoiceCreditable,
  assertIssueDateNotBeforeInvoice,
  assertWithinBillingOutstanding,
  assertWithinInvoiceBalance,
  assertWithinUninvoicedAllowance,
  creditNoteCappedByOutstanding,
  creditNoteFormLimit,
  CREDIT_NOTE_NOT_REQUIRED_TEXT,
  expectedCreditNoteVat,
  isAwaitingCreditNote,
  isCreditNoteBlockedByOutstanding,
  maxCreditNoteTotalSatang,
  netInvoiceAmounts,
  requireCreditNoteCancelReason,
  resolveCreditNoteAmounts,
  resolveCreditNoteVatRate,
  sumActiveCreditNotes,
  suggestedCreditNoteVatSatang,
  type CreditNoteAmountRow,
} from '@/lib/credit-notes/credit-note'

/** มติ PO 05/10/2569 U14 + มติบัญชี B1 — สูตร VAT ใบลดหนี้ + ยอดคงเหลือของใบกำกับ */

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
    return undefined
  } catch (error) {
    return (error as { code?: string }).code ?? 'NO_CODE'
  }
}

const INVOICE = { totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 }

function row(before: number, status: CreditNoteAmountRow['status'] = 'active'): CreditNoteAmountRow {
  const vat = expectedCreditNoteVat(before, 7)
  return { amountBeforeVatSatang: before, vatSatang: vat, totalSatang: before + vat, status }
}

describe('อัตรา VAT ของใบกำกับเดิม', () => {
  it('อัตราเดียว (สตริง NUMERIC จาก DB) ⇒ ใช้อัตรานั้น', () => {
    expect(resolveCreditNoteVatRate(['7.00', '7', 7])).toBe(7)
  })

  it('ไม่มีอัตรา หรือหลายอัตราในรอบเดียว ⇒ CREDIT_NOTE_VAT_MISMATCH', () => {
    expect(codeOf(() => resolveCreditNoteVatRate([]))).toBe('CREDIT_NOTE_VAT_MISMATCH')
    expect(codeOf(() => resolveCreditNoteVatRate(['7.00', '10.00']))).toBe('CREDIT_NOTE_VAT_MISMATCH')
  })
})

describe('ยอดใบลดหนี้ (B1: ลด 100 + VAT 7)', () => {
  it('ไม่ส่ง VAT ⇒ คิดจากอัตราเดิม · total คิดที่ server', () => {
    expect(resolveCreditNoteAmounts({ amountBeforeVatSatang: 10_000, vatRatePct: 7 })).toEqual({
      amountBeforeVatSatang: 10_000,
      vatSatang: 700,
      totalSatang: 10_700,
    })
  })

  it('ปัดครึ่งขึ้นครั้งเดียว (ตัวคูณกลาง) — 0.50 บาท × 7% = 3.5 สตางค์ ⇒ 4', () => {
    expect(expectedCreditNoteVat(50, 7)).toBe(4)
  })

  it('รับ VAT ตามเอกสารจริงที่ต่างไม่เกิน 1 สตางค์', () => {
    expect(resolveCreditNoteAmounts({ amountBeforeVatSatang: 50, vatSatang: 3, vatRatePct: 7 }).totalSatang).toBe(53)
    expect(resolveCreditNoteAmounts({ amountBeforeVatSatang: 50, vatSatang: 5, vatRatePct: 7 }).vatSatang).toBe(5)
  })

  it('VAT ต่างเกิน 1 สตางค์ ⇒ CREDIT_NOTE_VAT_MISMATCH', () => {
    expect(codeOf(() => resolveCreditNoteAmounts({ amountBeforeVatSatang: 10_000, vatSatang: 698, vatRatePct: 7 }))).toBe(
      'CREDIT_NOTE_VAT_MISMATCH',
    )
  })

  it('ใบกำกับอัตรา 0% ⇒ VAT 0 เท่านั้น', () => {
    expect(resolveCreditNoteAmounts({ amountBeforeVatSatang: 10_000, vatRatePct: 0 }).vatSatang).toBe(0)
    expect(codeOf(() => resolveCreditNoteAmounts({ amountBeforeVatSatang: 10_000, vatSatang: 700, vatRatePct: 0 }))).toBe(
      'CREDIT_NOTE_VAT_MISMATCH',
    )
  })

  it('ยอด ≤ 0 หรือไม่ใช่สตางค์จำนวนเต็ม ⇒ RangeError (บั๊ก ไม่ใช่ค่าที่ยอมรับ)', () => {
    expect(() => resolveCreditNoteAmounts({ amountBeforeVatSatang: 0, vatRatePct: 7 })).toThrow(RangeError)
    expect(() => resolveCreditNoteAmounts({ amountBeforeVatSatang: 100.5, vatRatePct: 7 })).toThrow(RangeError)
    expect(() => resolveCreditNoteAmounts({ amountBeforeVatSatang: 100, vatSatang: -1, vatRatePct: 7 })).toThrow(RangeError)
  })
})

describe('ยอดคงเหลือของใบกำกับ', () => {
  it('นับเฉพาะใบ active — ใบที่ยกเลิกไม่ลดยอด', () => {
    const rows = [row(10_000), row(50_000, 'cancelled')]
    expect(sumActiveCreditNotes(rows)).toEqual({ amountBeforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700 })
    expect(netInvoiceAmounts(INVOICE, rows)).toEqual({
      totalBeforeVatSatang: 1_190_000,
      vatSatang: 83_300,
      totalSatang: 1_273_300,
    })
  })

  it('ลดได้พอดียอดคงเหลือ · เกิน 1 สตางค์ ⇒ CREDIT_NOTE_EXCEEDS_INVOICE', () => {
    const existing = [row(1_000_000)]
    const exact = resolveCreditNoteAmounts({ amountBeforeVatSatang: 200_000, vatRatePct: 7 })
    expect(() => assertWithinInvoiceBalance(INVOICE, existing, exact)).not.toThrow()

    const over = resolveCreditNoteAmounts({ amountBeforeVatSatang: 200_001, vatRatePct: 7 })
    expect(codeOf(() => assertWithinInvoiceBalance(INVOICE, existing, over))).toBe('CREDIT_NOTE_EXCEEDS_INVOICE')
  })

  it('ก่อน VAT ไม่เกินแต่ยอดรวมเกิน (VAT ปัดขึ้นตามเอกสาร) ⇒ ปฏิเสธ', () => {
    const invoice = { totalBeforeVatSatang: 50, vatSatang: 3, totalSatang: 53 }
    const next = resolveCreditNoteAmounts({ amountBeforeVatSatang: 50, vatSatang: 4, vatRatePct: 7 })
    expect(codeOf(() => assertWithinInvoiceBalance(invoice, [], next))).toBe('CREDIT_NOTE_EXCEEDS_INVOICE')
  })
})

describe('เงื่อนไขการบันทึก/ยกเลิก', () => {
  it('อ้างใบกำกับที่ยกเลิกแล้วไม่ได้', () => {
    expect(codeOf(() => assertInvoiceCreditable('active'))).toBeUndefined()
    expect(codeOf(() => assertInvoiceCreditable('cancelled'))).toBe('TAX_INVOICE_INVALID_STATUS')
  })

  it('วันที่ใบลดหนี้ก่อนวันที่ใบกำกับ ⇒ CREDIT_NOTE_DATE_BEFORE_INVOICE · วันเดียวกันได้', () => {
    const invoiceDate = new Date('2026-09-10T00:00:00Z')
    expect(codeOf(() => assertIssueDateNotBeforeInvoice(new Date('2026-09-10T00:00:00Z'), invoiceDate))).toBeUndefined()
    expect(codeOf(() => assertIssueDateNotBeforeInvoice(new Date('2026-09-09T00:00:00Z'), invoiceDate))).toBe(
      'CREDIT_NOTE_DATE_BEFORE_INVOICE',
    )
  })

  it('ยกเลิกได้เฉพาะใบ active · ต้องมีเหตุผล', () => {
    expect(codeOf(() => assertCreditNoteCancellable('cancelled'))).toBe('CREDIT_NOTE_INVALID_STATUS')
    expect(codeOf(() => requireCreditNoteCancelReason('   '))).toBe('CANCEL_REQUIRES_REASON')
    expect(requireCreditNoteCancelReason('  กรอกเลขที่ผิด ')).toBe('กรอกเลขที่ผิด')
  })

  it('Adjustment ที่อ้างถึงได้ = ลดยอด + อนุมัติแล้ว + รอบเดียวกัน + ยังไม่มีใบลดหนี้', () => {
    const ok = { status: 'approved', adjustmentType: 'decrease', billingBatchId: 'b1', hasActiveCreditNote: false } as const
    expect(codeOf(() => assertAdjustmentLinkable(ok, 'b1'))).toBeUndefined()
    expect(codeOf(() => assertAdjustmentLinkable({ ...ok, status: 'pending_approval' }, 'b1'))).toBe(
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
    expect(codeOf(() => assertAdjustmentLinkable({ ...ok, adjustmentType: 'increase' }, 'b1'))).toBe(
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
    expect(codeOf(() => assertAdjustmentLinkable(ok, 'b2'))).toBe('CREDIT_NOTE_ADJUSTMENT_MISMATCH')
    expect(codeOf(() => assertAdjustmentLinkable({ ...ok, hasActiveCreditNote: true }, 'b1'))).toBe(
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
  })

  it('ป้าย "รอใบลดหนี้" เฉพาะ ลดยอด + อนุมัติแล้ว + มีใบกำกับ active + ยังไม่มีใบลดหนี้', () => {
    const base = { status: 'approved', adjustmentType: 'decrease', hasActiveInvoice: true, hasActiveCreditNote: false } as const
    expect(isAwaitingCreditNote(base)).toBe(true)
    expect(isAwaitingCreditNote({ ...base, hasActiveCreditNote: true })).toBe(false)
    expect(isAwaitingCreditNote({ ...base, hasActiveInvoice: false })).toBe(false)
    expect(isAwaitingCreditNote({ ...base, status: 'pending_approval' })).toBe(false)
    expect(isAwaitingCreditNote({ ...base, adjustmentType: 'increase' })).toBe(false)
  })
})

describe('มติ PO U171 — เพดานยอดค้างตามเอกสารของรอบวางบิล', () => {
  const amounts = (total: number) => ({ amountBeforeVatSatang: total, vatSatang: 0, totalSatang: total })

  it('ยอดค้าง 0 (ชำระครบ) ⇒ ปฏิเสธทุกยอด + ข้อความบอกไม่มียอดค้าง และให้สำนักงานบัญชีคืนเงินนอกระบบ', () => {
    expect(codeOf(() => assertWithinBillingOutstanding(0, amounts(1)))).toBe('CREDIT_NOTE_EXCEEDS_OUTSTANDING')
    try {
      assertWithinBillingOutstanding(0, amounts(10_700))
    } catch (error) {
      expect(String(error)).toContain('ไม่มียอดค้างชำระ')
      expect(String(error)).toContain('คืนเงินนอกระบบ')
    }
  })

  it('ยอดค้าง 107.00 ⇒ เท่ากันผ่าน · เกิน 1 สตางค์ปฏิเสธพร้อมยอดที่ลดได้', () => {
    expect(() => assertWithinBillingOutstanding(10_700, amounts(10_700))).not.toThrow()
    try {
      assertWithinBillingOutstanding(10_700, amounts(10_701))
      expect.unreachable()
    } catch (error) {
      expect((error as { code?: string }).code).toBe('CREDIT_NOTE_EXCEEDS_OUTSTANDING')
      expect(String(error)).toContain('฿107.00')
    }
  })

  it('ยอดค้างติดลบ (รับเกิน) ⇒ ปฏิเสธ · ยอดที่ลดได้ไม่ติดลบ', () => {
    expect(codeOf(() => assertWithinBillingOutstanding(-10_700, amounts(1)))).toBe('CREDIT_NOTE_EXCEEDS_OUTSTANDING')
    expect(maxCreditNoteTotalSatang(1_284_000, -10_700)).toBe(0)
  })

  it('ลดได้สูงสุด = ค่าน้อยกว่าระหว่างคงเหลือของใบกำกับกับยอดค้างของรอบ', () => {
    expect(maxCreditNoteTotalSatang(1_284_000, 10_700)).toBe(10_700)
    expect(maxCreditNoteTotalSatang(50_000, 1_284_000)).toBe(50_000)
  })
})

describe('canWaiveAwaitingCreditNote (staging E-016)', () => {
  it('ปิดป้ายได้เฉพาะรอใบลดหนี้ของบิลที่ไม่มียอดค้าง', () => {
    expect(canWaiveAwaitingCreditNote({ noteType: 'credit', billOutstandingSatang: 0 })).toBe(true)
    expect(canWaiveAwaitingCreditNote({ noteType: 'credit', billOutstandingSatang: 1 })).toBe(false)
    expect(canWaiveAwaitingCreditNote({ noteType: 'debit', billOutstandingSatang: 0 })).toBe(false)
    expect(canWaiveAwaitingCreditNote({ noteType: null, billOutstandingSatang: 0 })).toBe(false)
  })
})

describe('adjustmentAmountMismatch — staging E-063', () => {
  it('ยอดเท่ากัน/ยังไม่เลือก/ยังไม่กรอก ⇒ ไม่เตือน · ยอดต่างจริง ⇒ เตือน', () => {
    expect(adjustmentAmountMismatch(10_000, 10_000)).toBeNull()
    expect(adjustmentAmountMismatch(10_000, null)).toBeNull()
    expect(adjustmentAmountMismatch(null, 10_000)).toBeNull()
    expect(adjustmentAmountMismatch(9_000, 10_000)).toEqual({ amountSatang: 9_000, adjustmentSatang: 10_000 })
  })
})

describe('mytester G-10 — ปิดปุ่มบันทึกใบลดหนี้เมื่อลดได้สูงสุด ฿0', () => {
  it('ใบลดหนี้ + ลดได้ 0 ⇒ บล็อก · ใบเพิ่มหนี้/ยังไม่รู้ยอดค้าง/ลดได้ > 0 ⇒ ไม่บล็อก', () => {
    expect(isCreditNoteBlockedByOutstanding('credit', 0)).toBe(true)
    expect(isCreditNoteBlockedByOutstanding('debit', 0)).toBe(false)
    expect(isCreditNoteBlockedByOutstanding('credit', null)).toBe(false)
    expect(isCreditNoteBlockedByOutstanding('credit', 15_000)).toBe(false)
  })
})

describe('mytester3 LR3-01 — เพดานฟอร์มใบลดหนี้ตามมติรีวิว R3 #1', () => {
  it('ส่วนที่ลดยังไม่ออกใบ (allowance 0) ⇒ บล็อก "uninvoiced" + เพดาน 0 แม้ยอดค้างของรอบยังเหลือ 5,000', () => {
    expect(
      creditNoteFormLimit({ noteType: 'credit', maxCreditTotalSatang: 500_000, allowanceBeforeVatSatang: 0 }),
    ).toEqual({ blocked: 'uninvoiced', maxTotalSatang: 0, maxBeforeVatSatang: 0 })
  })

  it('ยอดค้าง 0 ⇒ บล็อก "outstanding" · allowance เหลือ ⇒ แสดงเพดานก่อนภาษีด้วย', () => {
    expect(creditNoteFormLimit({ noteType: 'credit', maxCreditTotalSatang: 0, allowanceBeforeVatSatang: null })).toEqual({
      blocked: 'outstanding',
      maxTotalSatang: 0,
      maxBeforeVatSatang: null,
    })
    expect(
      creditNoteFormLimit({ noteType: 'credit', maxCreditTotalSatang: 500_000, allowanceBeforeVatSatang: 20_000 }),
    ).toEqual({ blocked: null, maxTotalSatang: 500_000, maxBeforeVatSatang: 20_000 })
  })

  it('ใบเพิ่มหนี้ไม่บล็อก · ไม่จำกัด (null) ⇒ ใช้เพดานยอดค้างตามเดิม', () => {
    expect(creditNoteFormLimit({ noteType: 'debit', maxCreditTotalSatang: 0, allowanceBeforeVatSatang: 0 }).blocked).toBeNull()
    expect(
      creditNoteFormLimit({ noteType: 'credit', maxCreditTotalSatang: 10_700, allowanceBeforeVatSatang: null }),
    ).toEqual({ blocked: null, maxTotalSatang: 10_700, maxBeforeVatSatang: null })
  })

  it('server ปฏิเสธด้วยหัวข้อตรงเหตุผล — "ไม่ต้องออกใบลดหนี้" (ไม่ใช่ "เกินยอดค้างชำระ")', () => {
    const amounts = { amountBeforeVatSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000 }
    try {
      assertWithinUninvoicedAllowance(0, amounts)
      expect.unreachable()
    } catch (error) {
      const { code, title, userMessage } = error as { code: string; title: string; userMessage: string }
      expect(code).toBe('CREDIT_NOTE_EXCEEDS_OUTSTANDING')
      expect(title).toBe('ไม่ต้องออกใบลดหนี้')
      expect(userMessage).toContain(CREDIT_NOTE_NOT_REQUIRED_TEXT)
    }
    try {
      assertWithinUninvoicedAllowance(20_000, amounts)
      expect.unreachable()
    } catch (error) {
      expect((error as { title: string }).title).toBe('ยอดใบลดหนี้เกินส่วนที่ออกใบกำกับภาษีแล้ว')
      expect((error as { userMessage: string }).userMessage).toContain('฿200.00')
    }
  })
})

describe('mytester4 G4-01 — ใบลดหนี้ส่วนเกินตามมติรีวิว R3 #1 ข้อ 2 ไม่ชนเพดานยอดค้างของรอบ', () => {
  it('กติกา §6.8.3 คุม (allowance ≠ null) ⇒ ไม่ใช้เพดานยอดค้าง · ไม่คุม (null) ⇒ เพดานยอดค้างตาม U171', () => {
    expect(creditNoteCappedByOutstanding(3_936)).toBe(false)
    expect(creditNoteCappedByOutstanding(0)).toBe(false)
    expect(creditNoteCappedByOutstanding(null)).toBe(true)
  })

  it('ฟอร์ม BL-2569-003: ยอดค้าง 0.01 แต่ลดหนี้ได้ 39.36 ก่อนภาษี ⇒ ไม่บล็อก · เพดานรวมภาษี = คงเหลือของใบ 1,500', () => {
    expect(
      creditNoteFormLimit({
        noteType: 'credit',
        maxCreditTotalSatang: 1,
        allowanceBeforeVatSatang: 3_936,
        invoiceCreditableTotalSatang: 150_000,
      }),
    ).toEqual({ blocked: null, maxTotalSatang: 150_000, maxBeforeVatSatang: 3_936 })
    expect(
      creditNoteFormLimit({ noteType: 'credit', maxCreditTotalSatang: 0, allowanceBeforeVatSatang: 3_936, invoiceCreditableTotalSatang: 150_000 })
        .blocked,
    ).toBeNull()
    // allowance 0 ยังบล็อก "ไม่ต้องออกใบลดหนี้" · ไม่คุม (null) ⇒ ยอดค้าง 0 ยังบล็อกตาม U171
    expect(
      creditNoteFormLimit({ noteType: 'credit', maxCreditTotalSatang: 1, allowanceBeforeVatSatang: 0, invoiceCreditableTotalSatang: 150_000 })
        .blocked,
    ).toBe('uninvoiced')
    expect(
      creditNoteFormLimit({ noteType: 'credit', maxCreditTotalSatang: 0, allowanceBeforeVatSatang: null, invoiceCreditableTotalSatang: 150_000 })
        .blocked,
    ).toBe('outstanding')
  })
})

describe('mytester4 — VAT ใบลดหนี้ส่วนเกินที่ปิดยอดแบบส่วนต่าง (BL-2569-003)', () => {
  // ยอดตามเอกสารก่อนใบลดหนี้ 1,401.87 + 98.13 (= ใบรับ 1,500 · R = V) · ส่วนที่ยังบันทึกได้ 39.36
  const SPC = {
    amountBeforeVatSatang: 3_936,
    allowanceBeforeVatSatang: 3_936,
    remainingUninvoicedBeforeVatSatang: 0,
    documentedBeforeVatSatang: 140_187,
    documentedVatSatang: 9_813,
    vatRatesPct: [7, 7, 7],
  }

  it('VAT = 98.13 − round(1,362.51 × 7%) = 2.75 (ไม่ใช่ 2.76) ⇒ ยอดหลังลด 1,457.89 = มูลค่าสุทธิ', () => {
    const vat = closingCreditNoteVatSatang(SPC)
    expect(vat).toBe(275)
    expect(expectedCreditNoteVat(3_936, 7)).toBe(276)
    expect(150_000 - (3_936 + (vat ?? 0))).toBe(136_251 + 9_538)
  })

  it('ไม่เข้าเงื่อนไข ⇒ null (ลดไม่เท่าส่วนที่บันทึกได้ / ยังมีมูลค่าไม่ออกใบ / หลายอัตรา / กติกาไม่คุม)', () => {
    expect(closingCreditNoteVatSatang({ ...SPC, amountBeforeVatSatang: 3_000 })).toBeNull()
    expect(closingCreditNoteVatSatang({ ...SPC, remainingUninvoicedBeforeVatSatang: 100 })).toBeNull()
    expect(closingCreditNoteVatSatang({ ...SPC, vatRatesPct: [7, 10] })).toBeNull()
    expect(closingCreditNoteVatSatang({ ...SPC, allowanceBeforeVatSatang: null })).toBeNull()
    expect(closingCreditNoteVatSatang({ ...SPC, vatRatesPct: [] })).toBeNull()
  })

  it('ส่วนต่างเกินเกณฑ์ ±1 สตางค์ของค่าตามอัตรา ⇒ null (ใช้สูตรอัตราเดิม)', () => {
    expect(closingCreditNoteVatSatang({ ...SPC, documentedVatSatang: 9_820 })).toBeNull()
  })

  it('resolveCreditNoteAmounts: ไม่กรอก VAT ⇒ ใช้ค่าที่ระบบเสนอ · กรอกเอง ⇒ ใช้ค่าที่กรอก · ค่าเสนอเกินเกณฑ์ ⇒ ปฏิเสธ', () => {
    expect(resolveCreditNoteAmounts({ amountBeforeVatSatang: 3_936, vatRatePct: 7, defaultVatSatang: 275 })).toEqual({
      amountBeforeVatSatang: 3_936,
      vatSatang: 275,
      totalSatang: 4_211,
    })
    expect(resolveCreditNoteAmounts({ amountBeforeVatSatang: 3_936, vatRatePct: 7, vatSatang: 276, defaultVatSatang: 275 }).vatSatang).toBe(276)
    expect(resolveCreditNoteAmounts({ amountBeforeVatSatang: 3_936, vatRatePct: 7, defaultVatSatang: null }).vatSatang).toBe(276)
    expect(() => resolveCreditNoteAmounts({ amountBeforeVatSatang: 3_936, vatRatePct: 7, defaultVatSatang: 270 })).toThrow()
  })

  it('ฟอร์มเสนอค่าเฉพาะใบลดหนี้ที่ลดเท่าส่วนที่บันทึกได้พอดี', () => {
    const base = { isDebit: false, amountBeforeVatSatang: 3_936, allowanceBeforeVatSatang: 3_936, closingVatSatang: 275 }
    expect(suggestedCreditNoteVatSatang(base)).toBe(275)
    expect(suggestedCreditNoteVatSatang({ ...base, amountBeforeVatSatang: 3_900 })).toBeNull()
    expect(suggestedCreditNoteVatSatang({ ...base, amountBeforeVatSatang: null })).toBeNull()
    expect(suggestedCreditNoteVatSatang({ ...base, isDebit: true })).toBeNull()
    expect(suggestedCreditNoteVatSatang({ ...base, closingVatSatang: null })).toBeNull()
  })
})
