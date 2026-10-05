import { describe, expect, it } from 'vitest'
import {
  assertAdjustmentLinkable,
  assertCreditNoteCancellable,
  assertInvoiceCreditable,
  assertIssueDateNotBeforeInvoice,
  assertWithinInvoiceBalance,
  expectedCreditNoteVat,
  isAwaitingCreditNote,
  netInvoiceAmounts,
  requireCreditNoteCancelReason,
  resolveCreditNoteAmounts,
  resolveCreditNoteVatRate,
  sumActiveCreditNotes,
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
