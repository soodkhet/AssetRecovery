import { pctOfSatang } from '@/lib/finance/satang'
import type { AdjustmentStatus, AdjustmentType, CreditNoteStatus, TaxInvoiceStatus } from '@/lib/generated/prisma/enums'
import { SalesError } from '@/lib/sales/errors'

/**
 * ใบลดหนี้ที่สำนักงานบัญชีออกนอกระบบ (มติ PO 05/10/2569 U14 + มติบัญชี B1 · ม.86/10) — **pure ล้วน ไม่มี I/O**
 *
 * ระบบ **ไม่ออก** ใบลดหนี้เอง (Hybrid Accounting Boundary) — แค่บันทึกข้อมูลเอกสารที่ออกจริงแล้ว
 * เพื่อให้ยอดที่ลูกค้าเห็น (portal) และชุดเอกสารบัญชีตรงกับเอกสารที่ออกให้ลูกค้า
 *
 * ### VAT ของใบลดหนี้ (`22` §6.8 ส่วนต่อท้าย v-U14)
 * - อัตรา = `vat_rate_pct_used` ของ **ใบกำกับเดิม** (snapshot จาก `revenues.vat_rate_pct_used` ของรอบวางบิล)
 *   ห้ามใช้อัตราปัจจุบัน และห้าม hardcode (Rule 01)
 * - VAT ที่คาด = `pctOfSatang(มูลค่าที่ลดก่อน VAT, อัตรา)` (ปัดครึ่งขึ้นครั้งเดียว — ตัวคูณกลางของระบบ)
 * - **รับยอด VAT ตามเอกสารจริง** ได้ ถ้าต่างจากที่คาดไม่เกิน {@link CREDIT_NOTE_VAT_TOLERANCE_SATANG}
 *   สตางค์ (เศษปัดของสำนักงานบัญชี) — ต่างเกินนั้น = กรอกผิด ⇒ `CREDIT_NOTE_VAT_MISMATCH`
 * - ยอดรวม = ก่อน VAT + VAT **คิดที่ server เสมอ** ไม่รับจากผู้ใช้ (กันยอดไม่สมดุล)
 */

/** ส่วนต่าง VAT ที่ยอมให้ตามเอกสารจริง (สตางค์) — มากกว่านี้ถือว่ากรอกผิด */
export const CREDIT_NOTE_VAT_TOLERANCE_SATANG = 1

export const CREDIT_NOTE_STATUS_LABEL: Record<CreditNoteStatus, string> = {
  active: 'ใช้งาน',
  cancelled: 'ยกเลิก',
}

/** ป้ายของ Adjustment ที่อนุมัติแล้วแต่ยังไม่มีใบลดหนี้ (หน้า Adjustment/ใบกำกับ) */
export const AWAITING_CREDIT_NOTE_LABEL = 'รอใบลดหนี้'

// ── อัตรา VAT ──────────────────────────────────────────────────────────────

/**
 * อัตรา VAT ของใบกำกับเดิม จาก snapshot ของรายได้ในรอบวางบิล — ต้องมีอัตราเดียว
 * (หลายอัตรา = แยกไม่ได้ว่าใบลดหนี้ลดส่วนไหน ⇒ ปฏิเสธ ให้สำนักงานบัญชีตรวจก่อน)
 */
export function resolveCreditNoteVatRate(vatRatesPct: readonly (string | number)[]): number {
  const unique = [...new Set(vatRatesPct.map((rate) => Number(rate)).filter((rate) => Number.isFinite(rate)))]
  const only = unique[0]
  if (unique.length !== 1 || only === undefined) {
    throw new SalesError('CREDIT_NOTE_VAT_MISMATCH', {
      detail: unique.length === 0 ? 'ไม่พบอัตรา VAT ของใบกำกับเดิม' : `รอบวางบิลมีหลายอัตรา VAT: ${unique.join(', ')}`,
      context: { vatRates: unique },
    })
  }
  return only
}

/** VAT ที่คาดของใบลดหนี้ = มูลค่าที่ลดก่อน VAT × อัตราของใบกำกับเดิม */
export function expectedCreditNoteVat(amountBeforeVatSatang: number, vatRatePct: number): number {
  return pctOfSatang(amountBeforeVatSatang, vatRatePct)
}

export interface CreditNoteAmountInput {
  amountBeforeVatSatang: number
  /** VAT ตามเอกสารจริง — `null`/ไม่ส่ง = ใช้ค่าที่คำนวณจากอัตรา */
  vatSatang?: number | null
  vatRatePct: number
}

export interface CreditNoteAmounts {
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

/** ยอดของใบลดหนี้ที่บันทึกได้ — ตรวจยอด > 0 และ VAT สอดคล้องกับอัตราเดิม (± เศษปัด) */
export function resolveCreditNoteAmounts(input: CreditNoteAmountInput): CreditNoteAmounts {
  const before = input.amountBeforeVatSatang
  if (!Number.isInteger(before) || before <= 0) {
    throw new RangeError(`resolveCreditNoteAmounts: มูลค่าที่ลดต้องเป็นสตางค์จำนวนเต็มบวก (ได้ ${before})`)
  }
  const expected = expectedCreditNoteVat(before, input.vatRatePct)
  const vat = input.vatSatang ?? expected
  if (!Number.isInteger(vat) || vat < 0) {
    throw new RangeError(`resolveCreditNoteAmounts: VAT ต้องเป็นสตางค์จำนวนเต็มไม่ติดลบ (ได้ ${vat})`)
  }
  if (Math.abs(vat - expected) > CREDIT_NOTE_VAT_TOLERANCE_SATANG) {
    throw new SalesError('CREDIT_NOTE_VAT_MISMATCH', {
      detail: `VAT ${vat} ต่างจากที่คาด ${expected} (อัตรา ${input.vatRatePct}%)`,
      context: { expectedVatSatang: expected, vatSatang: vat, vatRatePct: input.vatRatePct },
    })
  }
  return { amountBeforeVatSatang: before, vatSatang: vat, totalSatang: before + vat }
}

// ── ยอดคงเหลือของใบกำกับ ────────────────────────────────────────────────────

export interface InvoiceAmounts {
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

export interface CreditNoteAmountRow {
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  status: CreditNoteStatus
}

/** ผลรวมใบลดหนี้ที่ `active` เท่านั้น (ใบที่ยกเลิกไม่ลดยอด) */
export function sumActiveCreditNotes(rows: readonly CreditNoteAmountRow[]): CreditNoteAmounts {
  let amountBeforeVatSatang = 0
  let vatSatang = 0
  let totalSatang = 0
  for (const row of rows) {
    if (row.status !== 'active') continue
    amountBeforeVatSatang += row.amountBeforeVatSatang
    vatSatang += row.vatSatang
    totalSatang += row.totalSatang
  }
  return { amountBeforeVatSatang, vatSatang, totalSatang }
}

/** ยอดสุทธิของใบกำกับหลังหักใบลดหนี้ active = ยอดคงเหลือที่ยังลดได้ */
export function netInvoiceAmounts(invoice: InvoiceAmounts, rows: readonly CreditNoteAmountRow[]): InvoiceAmounts {
  const used = sumActiveCreditNotes(rows)
  return {
    totalBeforeVatSatang: invoice.totalBeforeVatSatang - used.amountBeforeVatSatang,
    vatSatang: invoice.vatSatang - used.vatSatang,
    totalSatang: invoice.totalSatang - used.totalSatang,
  }
}

/** ใบลดหนี้ใหม่ต้องไม่ทำให้ยอดรวมเกินใบกำกับ (ทั้งก่อน VAT และยอดรวม) */
export function assertWithinInvoiceBalance(
  invoice: InvoiceAmounts,
  existing: readonly CreditNoteAmountRow[],
  next: CreditNoteAmounts,
): void {
  const remaining = netInvoiceAmounts(invoice, existing)
  if (next.amountBeforeVatSatang <= remaining.totalBeforeVatSatang && next.totalSatang <= remaining.totalSatang) return
  throw new SalesError('CREDIT_NOTE_EXCEEDS_INVOICE', {
    detail: `ขอลด ${next.amountBeforeVatSatang}/${next.totalSatang} คงเหลือ ${remaining.totalBeforeVatSatang}/${remaining.totalSatang}`,
    context: {
      remainingBeforeVatSatang: remaining.totalBeforeVatSatang,
      remainingTotalSatang: remaining.totalSatang,
    },
  })
}

// ── เงื่อนไขอื่น ────────────────────────────────────────────────────────────

/** ใบกำกับที่ยกเลิกแล้วอ้างถึงไม่ได้ (ต้องอ้างใบที่ใช้งานอยู่) */
export function assertInvoiceCreditable(status: TaxInvoiceStatus): void {
  if (status === 'active') return
  throw new SalesError('TAX_INVOICE_INVALID_STATUS', {
    detail: 'ใบกำกับที่ยกเลิกแล้วบันทึกใบลดหนี้อ้างถึงไม่ได้',
    context: { currentStatus: status },
  })
}

/** วันที่ใบลดหนี้ต้องไม่ก่อนวันที่ใบกำกับ (เทียบวันปฏิทิน — ทั้งคู่เป็นคอลัมน์ DATE) */
export function assertIssueDateNotBeforeInvoice(issueDate: Date, invoiceDate: Date): void {
  if (issueDate.getTime() >= invoiceDate.getTime()) return
  throw new SalesError('CREDIT_NOTE_DATE_BEFORE_INVOICE', {
    detail: `${issueDate.toISOString().slice(0, 10)} < ${invoiceDate.toISOString().slice(0, 10)}`,
  })
}

/** `active → cancelled` เท่านั้น */
export function assertCreditNoteCancellable(status: CreditNoteStatus): void {
  if (status === 'active') return
  throw new SalesError('CREDIT_NOTE_INVALID_STATUS', { detail: `cancel at ${status}`, context: { currentStatus: status } })
}

export interface LinkableAdjustment {
  status: AdjustmentStatus
  adjustmentType: AdjustmentType
  /** รอบวางบิลของรายการต้นทาง (revenue → billing_batch_id / billing_batch ตรง) — `null` = ไม่ผูกรอบ */
  billingBatchId: string | null
  hasActiveCreditNote: boolean
}

/** Adjustment ที่อ้างถึงได้ = ลดยอด + อนุมัติแล้ว + รอบวางบิลเดียวกับใบกำกับ + ยังไม่มีใบลดหนี้ active */
export function assertAdjustmentLinkable(adjustment: LinkableAdjustment, invoiceBillingBatchId: string): void {
  const problems: string[] = []
  if (adjustment.status !== 'approved') problems.push(`status=${adjustment.status}`)
  if (adjustment.adjustmentType !== 'decrease') problems.push(`type=${adjustment.adjustmentType}`)
  if (adjustment.billingBatchId !== invoiceBillingBatchId) problems.push('คนละรอบวางบิล')
  if (adjustment.hasActiveCreditNote) problems.push('มีใบลดหนี้อ้างถึงแล้ว')
  if (problems.length === 0) return
  throw new SalesError('CREDIT_NOTE_ADJUSTMENT_MISMATCH', { detail: problems.join(', ') })
}

/**
 * Adjustment ที่ "รอใบลดหนี้" = ลดยอด + อนุมัติแล้ว + รอบวางบิลของมันมีใบกำกับ active + ยังไม่มีใบลดหนี้ active อ้างถึง
 * (ลดยอดหลังออกใบกำกับแล้วต้องมีใบลดหนี้ตาม ม.86/10 — มติบัญชี B1)
 */
export function isAwaitingCreditNote(input: {
  status: AdjustmentStatus
  adjustmentType: AdjustmentType
  hasActiveInvoice: boolean
  hasActiveCreditNote: boolean
}): boolean {
  return (
    input.status === 'approved' &&
    input.adjustmentType === 'decrease' &&
    input.hasActiveInvoice &&
    !input.hasActiveCreditNote
  )
}

/** เหตุผลบังคับ (บันทึก/ยกเลิก) — คืนค่าที่ trim แล้ว · ว่าง = `CANCEL_REQUIRES_REASON` สำหรับการยกเลิก */
export function requireCreditNoteCancelReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new SalesError('CANCEL_REQUIRES_REASON', { detail: 'ยกเลิกใบลดหนี้ต้องมีเหตุผล' })
  return trimmed
}
