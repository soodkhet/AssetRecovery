import { describe, expect, it } from 'vitest'
import {
  adjustmentAmountMismatchWarning,
  assertAdjustmentLinkable,
  assertInvoiceHasNoActiveNotes,
  assertWithinInvoiceBalance,
  awaitingNoteType,
  AWAITING_NOTE_LABEL,
  creditableInvoiceBalance,
  CREDIT_NOTE_DOCUMENT_CODE,
  netInvoiceAmounts,
  noteTypeForAdjustment,
  resolveCreditNoteVatRate,
  sumActiveCreditNotes,
  sumActiveDebitNotes,
  type CreditNoteAmountRow,
} from '@/lib/credit-notes/credit-note'
import { SalesError } from '@/lib/sales/errors'
import { allocateRevenueAfterCreditNotes, applyCreditNotes, ZERO_AMOUNTS } from '@/lib/portal/documented-amounts'
import { serializePortalTaxInvoice } from '@/lib/portal/serializers'

/**
 * มติ PO 05/10/2569 U18–U21 (fixer X4) — ใบเพิ่มหนี้ (ม.86/9) ในโครงเดียวกับใบลดหนี้ · บล็อกยกเลิกใบกำกับ ·
 * เตือนยอดไม่ตรง Adjustment · ข้อความหลายอัตรา VAT — pure ล้วน
 */

function errorOf(run: () => unknown): SalesError | undefined {
  try {
    run()
    return undefined
  } catch (error) {
    return error instanceof SalesError ? error : undefined
  }
}

const INVOICE = { totalBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 }
const CN_100: CreditNoteAmountRow = { amountBeforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700, status: 'active' }
const DN_500: CreditNoteAmountRow = {
  amountBeforeVatSatang: 50_000,
  vatSatang: 3_500,
  totalSatang: 53_500,
  status: 'active',
  noteType: 'debit',
}

describe('ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้ + ใบเพิ่มหนี้ (U19)', () => {
  it('แยกผลรวมตามชนิด · ใบที่ยกเลิกไม่นับ · ไม่ระบุชนิด = ใบลดหนี้', () => {
    const rows = [CN_100, DN_500, { ...DN_500, status: 'cancelled' as const }]
    expect(sumActiveCreditNotes(rows)).toEqual({ amountBeforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700 })
    expect(sumActiveDebitNotes(rows)).toEqual({ amountBeforeVatSatang: 50_000, vatSatang: 3_500, totalSatang: 53_500 })
  })

  it('netInvoiceAmounts บวกใบเพิ่มหนี้ ทีละช่อง', () => {
    expect(netInvoiceAmounts(INVOICE, [CN_100, DN_500])).toEqual({
      totalBeforeVatSatang: 1_240_000,
      vatSatang: 86_800,
      totalSatang: 1_326_800,
    })
  })

  it('ใบเพิ่มหนี้ไม่มีเพดาน · ยอดที่ลดหนี้ได้ไม่นับใบเพิ่มหนี้ (กันยกเลิกใบเพิ่มหนี้แล้วลดหนี้ทะลุใบกำกับ)', () => {
    const bigDebit: CreditNoteAmountRow = { ...DN_500, amountBeforeVatSatang: 5_000_000, vatSatang: 350_000, totalSatang: 5_350_000 }
    expect(netInvoiceAmounts(INVOICE, [bigDebit]).totalSatang).toBe(6_634_000)
    expect(creditableInvoiceBalance(INVOICE, [CN_100, bigDebit])).toEqual({
      totalBeforeVatSatang: 1_190_000,
      vatSatang: 83_300,
      totalSatang: 1_273_300,
    })
    expect(
      errorOf(() =>
        assertWithinInvoiceBalance(INVOICE, [bigDebit], { amountBeforeVatSatang: 1_200_001, vatSatang: 0, totalSatang: 1_200_001 }),
      )?.code,
    ).toBe('CREDIT_NOTE_EXCEEDS_INVOICE')
  })

  it('portal applyCreditNotes รับใบเพิ่มหนี้ (ไม่ส่ง = 0 — ผู้เรียกเดิมได้ผลเท่าเดิม)', () => {
    const invoiced = { beforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000 }
    const credit = { beforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700 }
    const debit = { beforeVatSatang: 50_000, vatSatang: 3_500, totalSatang: 53_500 }
    expect(applyCreditNotes(invoiced, credit)).toEqual(applyCreditNotes(invoiced, credit, ZERO_AMOUNTS))
    expect(applyCreditNotes(invoiced, credit, debit)).toEqual({ beforeVatSatang: 1_240_000, vatSatang: 86_800, totalSatang: 1_326_800 })
  })
})

describe('ผูก Adjustment ตามชนิดเอกสาร (U19)', () => {
  const base = { status: 'approved' as const, billingBatchId: 'b1', hasActiveCreditNote: false }

  it('ใบลดหนี้ ⇒ decrease · ใบเพิ่มหนี้ ⇒ increase (สลับกัน = CREDIT_NOTE_ADJUSTMENT_MISMATCH)', () => {
    expect(errorOf(() => assertAdjustmentLinkable({ ...base, adjustmentType: 'decrease' }, 'b1'))).toBeUndefined()
    expect(errorOf(() => assertAdjustmentLinkable({ ...base, adjustmentType: 'increase' }, 'b1', 'debit'))).toBeUndefined()
    expect(errorOf(() => assertAdjustmentLinkable({ ...base, adjustmentType: 'increase' }, 'b1', 'credit'))?.code).toBe(
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
    expect(errorOf(() => assertAdjustmentLinkable({ ...base, adjustmentType: 'decrease' }, 'b1', 'debit'))?.code).toBe(
      'CREDIT_NOTE_ADJUSTMENT_MISMATCH',
    )
  })

  it('ป้าย "รอใบลดหนี้" / "รอใบเพิ่มหนี้" ตามชนิด Adjustment', () => {
    const input = { status: 'approved' as const, hasActiveInvoice: true, hasActiveCreditNote: false }
    expect(awaitingNoteType({ ...input, adjustmentType: 'decrease' })).toBe('credit')
    expect(awaitingNoteType({ ...input, adjustmentType: 'increase' })).toBe('debit')
    expect(awaitingNoteType({ ...input, adjustmentType: 'increase', hasActiveCreditNote: true })).toBeNull()
    expect(awaitingNoteType({ ...input, adjustmentType: 'increase', hasActiveInvoice: false })).toBeNull()
    expect(awaitingNoteType({ ...input, adjustmentType: 'increase', status: 'pending_approval' })).toBeNull()
    expect(AWAITING_NOTE_LABEL).toEqual({ credit: 'รอใบลดหนี้', debit: 'รอใบเพิ่มหนี้' })
    expect(noteTypeForAdjustment('decrease')).toBe('credit')
    expect(CREDIT_NOTE_DOCUMENT_CODE).toEqual({ credit: 'CN', debit: 'DN' })
  })
})

describe('U21 — เตือนยอดไม่ตรง Adjustment (ไม่บล็อก)', () => {
  const fmt = (satang: number): string => `฿${satang / 100}`

  it('ยอดตรง ⇒ null · ไม่ตรง ⇒ ข้อความไทยบอกทั้งสองยอดและชนิดเอกสาร', () => {
    expect(
      adjustmentAmountMismatchWarning({ noteType: 'credit', amountBeforeVatSatang: 10_000, adjustmentAmountSatang: 10_000, formatSatang: fmt }),
    ).toBeNull()
    const warning = adjustmentAmountMismatchWarning({
      noteType: 'debit',
      amountBeforeVatSatang: 50_000,
      adjustmentAmountSatang: 40_000,
      formatSatang: fmt,
    })
    expect(warning).toContain('ใบเพิ่มหนี้')
    expect(warning).toContain('฿500')
    expect(warning).toContain('฿400')
  })
})

describe('U18 — ยกเลิกใบกำกับที่มีใบลดหนี้/ใบเพิ่มหนี้ active', () => {
  it('ไม่มีเอกสาร ⇒ ผ่าน · มี ⇒ TAX_INVOICE_HAS_ACTIVE_NOTES + ข้อความบอกเลขเอกสารทุกใบ', () => {
    expect(errorOf(() => assertInvoiceHasNoActiveNotes([]))).toBeUndefined()
    const error = errorOf(() =>
      assertInvoiceHasNoActiveNotes([
        { noteType: 'credit', creditNoteNumber: 'CN-001' },
        { noteType: 'debit', creditNoteNumber: 'DN-002' },
      ]),
    )
    expect(error?.code).toBe('TAX_INVOICE_HAS_ACTIVE_NOTES')
    expect(error?.status).toBe(400)
    expect(error?.userMessage).toContain('ใบลดหนี้ CN-001')
    expect(error?.userMessage).toContain('ใบเพิ่มหนี้ DN-002')
    expect(error?.userMessage).not.toMatch(/§|ไฟล์ \d/)
  })
})

describe('U21 — หลายอัตรา VAT คงปฏิเสธ แต่ข้อความชัด', () => {
  it('ข้อความบอกว่ามีหลายอัตรา + ให้ติดต่อผู้ดูแล', () => {
    const error = errorOf(() => resolveCreditNoteVatRate(['7', '10']))
    expect(error?.code).toBe('CREDIT_NOTE_VAT_MISMATCH')
    expect(error?.userMessage).toContain('หลายอัตรา')
    expect(error?.userMessage).toContain('7%, 10%')
    expect(error?.userMessage).toContain('ติดต่อผู้ดูแลระบบ')
  })

  it('อัตราเดียว ⇒ ผ่าน · ไม่มีอัตรา ⇒ ข้อความแยกกรณี', () => {
    expect(resolveCreditNoteVatRate(['7.00', '7'])).toBe(7)
    expect(errorOf(() => resolveCreditNoteVatRate([]))?.userMessage).toContain('ไม่พบอัตรา')
  })
})

describe('กราฟรายได้ portal — ใบเพิ่มหนี้บวกยอด (วิธีกระจายเดียวกับใบลดหนี้)', () => {
  const revenues = [
    { id: 'r1', grossSatang: 600_000 },
    { id: 'r2', grossSatang: 600_000 },
  ]

  it('ผูก Adjustment → รายได้ ⇒ บวกตรงใบนั้น · ไม่ผูก ⇒ กระจายตามสัดส่วน · ผลรวม = ใบกำกับ − ลดหนี้ + เพิ่มหนี้', () => {
    const result = allocateRevenueAfterCreditNotes(1_200_000, revenues, [
      { amountBeforeVatSatang: 10_000, revenueId: 'r1' },
      { amountBeforeVatSatang: 50_000, revenueId: 'r2', noteType: 'debit' },
      { amountBeforeVatSatang: 1_001, revenueId: null, noteType: 'debit' },
    ])
    const total = [...result.values()].reduce((sum, value) => sum + value, 0)
    expect(total).toBe(1_200_000 - 10_000 + 50_000 + 1_001)
    expect(result.get('r1')).toBeGreaterThanOrEqual(590_000)
    expect(result.get('r2')).toBeGreaterThanOrEqual(650_000)
  })

  it('ทุกใบเป็น 0 (ลดหนี้เต็ม) แล้วมีใบเพิ่มหนี้ไม่ผูก ⇒ ยังไม่หายไป (กระจายตาม gross)', () => {
    const result = allocateRevenueAfterCreditNotes(1_200_000, revenues, [
      { amountBeforeVatSatang: 1_200_000, revenueId: null },
      { amountBeforeVatSatang: 1_000, revenueId: null, noteType: 'debit' },
    ])
    expect([...result.values()].reduce((sum, value) => sum + value, 0)).toBe(1_000)
  })
})

describe('portal DTO — ใบเพิ่มหนี้แยกช่อง whitelist เดียวกับใบลดหนี้', () => {
  it('แยก creditNotes / debitNotes · ยอดสุทธิบวกใบเพิ่มหนี้ · ไม่มีฟิลด์ภายใน', () => {
    const dto = serializePortalTaxInvoice({
      id: 'inv-1',
      invoiceNumber: 'INV-2569-0001',
      invoiceDate: new Date('2026-07-01T00:00:00Z'),
      status: 'active',
      totalBeforeVatSatang: 1_200_000,
      vatSatang: 84_000,
      totalSatang: 1_284_000,
      deliveryFormat: 'paper_pdf',
      creditNotes: [
        { id: 'cn-1', creditNoteNumber: 'CN-1', issueDate: '2026-07-05', amountBeforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700, buyerBranchCode: '00000' },
        {
          id: 'dn-1',
          noteType: 'debit',
          creditNoteNumber: 'DN-1',
          issueDate: '2026-07-06T00:00:00.000Z',
          amountBeforeVatSatang: 50_000,
          vatSatang: 3_500,
          totalSatang: 53_500,
          buyerBranchCode: '00001',
          ...({ reason: 'ภายใน', filePath: 'x', adjustmentId: 'a' } as object),
        },
      ],
    })
    expect(dto.creditNotes.map((note) => note.creditNoteNumber)).toEqual(['CN-1'])
    expect(dto.debitNotes).toEqual([
      {
        id: 'dn-1',
        creditNoteNumber: 'DN-1',
        issueDate: '2026-07-06',
        amountBeforeVatSatang: 50_000,
        vatSatang: 3_500,
        totalSatang: 53_500,
        // มติ PO U82 — สาขาผู้ซื้อตามใบกำกับเดิม (ข้อความ ไม่ใช่รหัสดิบ)
        branchLabel: 'สาขาที่ 00001',
      },
    ])
    expect(dto.netTotalSatang).toBe(1_284_000 - 10_700 + 53_500)
    expect(dto.netBeforeVatSatang).toBe(1_240_000)
  })
})
