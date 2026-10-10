import { pctOfSatang } from '@/lib/finance/satang'
import { fmtSatangSymbol } from '@/lib/format/money'
import type {
  AdjustmentStatus,
  AdjustmentType,
  CreditNoteStatus,
  CreditNoteType,
  TaxInvoiceStatus,
} from '@/lib/generated/prisma/enums'
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
 *
 * ### ใบเพิ่มหนี้ (มติ PO 05/10/2569 U19 · ม.86/9)
 * ตารางเดียวกัน แยกด้วย `note_type` (`credit` = ใบลดหนี้ · `debit` = ใบเพิ่มหนี้) — สูตร VAT เดียวกัน (อัตราใบกำกับเดิม)
 * · ใบเพิ่มหนี้**ไม่มีเพดาน**ยอดใบกำกับ (ยอด > 0) · ผูกได้เฉพาะ Adjustment `increase` (ใบลดหนี้ ⇒ `decrease`)
 * · ยอดตามเอกสาร = ใบกำกับ − ใบลดหนี้ active + ใบเพิ่มหนี้ active (`netInvoiceAmounts`)
 */

/** ส่วนต่าง VAT ที่ยอมให้ตามเอกสารจริง (สตางค์) — มากกว่านี้ถือว่ากรอกผิด */
export const CREDIT_NOTE_VAT_TOLERANCE_SATANG = 1

export const CREDIT_NOTE_STATUS_LABEL: Record<CreditNoteStatus, string> = {
  active: 'ใช้งาน',
  cancelled: 'ยกเลิก',
}

/** ป้ายของ Adjustment ที่อนุมัติแล้วแต่ยังไม่มีใบลดหนี้ (หน้า Adjustment/ใบกำกับ) */
export const AWAITING_CREDIT_NOTE_LABEL = 'รอใบลดหนี้'
/** ป้ายของ Adjustment เพิ่มยอดที่อนุมัติแล้วแต่ยังไม่มีใบเพิ่มหนี้ (มติ PO U19) */
export const AWAITING_DEBIT_NOTE_LABEL = 'รอใบเพิ่มหนี้'

/** ชื่อชนิดเอกสารบนจอ/ข้อความ */
export const CREDIT_NOTE_TYPE_LABEL: Record<CreditNoteType, string> = {
  credit: 'ใบลดหนี้',
  debit: 'ใบเพิ่มหนี้',
}

/** รหัสชนิดเอกสารในไฟล์ส่งสำนักงานบัญชี (`09_Credit_Notes.csv` คอลัมน์ `document_type`) */
export const CREDIT_NOTE_DOCUMENT_CODE: Record<CreditNoteType, 'CN' | 'DN'> = {
  credit: 'CN',
  debit: 'DN',
}

/** ป้าย "รอ…" ตามชนิดเอกสารที่ Adjustment ต้องการ */
export const AWAITING_NOTE_LABEL: Record<CreditNoteType, string> = {
  credit: AWAITING_CREDIT_NOTE_LABEL,
  debit: AWAITING_DEBIT_NOTE_LABEL,
}

/** ชนิด Adjustment ที่เอกสารแต่ละชนิดผูกได้ — ใบลดหนี้ ⇒ ลดยอด · ใบเพิ่มหนี้ ⇒ เพิ่มยอด */
export const NOTE_TYPE_ADJUSTMENT: Record<CreditNoteType, AdjustmentType> = {
  credit: 'decrease',
  debit: 'increase',
}

/** ชนิดเอกสารที่ Adjustment ต้องการ — `null` = ไม่ต้องมีเอกสารปรับปรุงใบกำกับ */
export function noteTypeForAdjustment(adjustmentType: AdjustmentType): CreditNoteType | null {
  if (adjustmentType === 'decrease') return 'credit'
  if (adjustmentType === 'increase') return 'debit'
  return null
}

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
      // มติ PO U21 — คงปฏิเสธ แต่บอกเหตุผลให้ชัด
      message:
        unique.length === 0
          ? 'ไม่พบอัตราภาษีมูลค่าเพิ่มของใบกำกับเดิม จึงคำนวณภาษีของเอกสารนี้ไม่ได้ — กรุณาติดต่อผู้ดูแลระบบ'
          : `รอบวางบิลของใบกำกับนี้มีรายได้หลายอัตราภาษีมูลค่าเพิ่ม (${unique.map((rate) => `${rate}%`).join(', ')}) ` +
            'ระบบจึงแยกไม่ได้ว่าเอกสารนี้ปรับส่วนใด และยังบันทึกให้ไม่ได้ — กรุณาติดต่อผู้ดูแลระบบ',
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
  /** ไม่ส่ง = `credit` (ใบลดหนี้ — ข้อมูลก่อน U19) */
  noteType?: CreditNoteType
}

function sumActive(rows: readonly CreditNoteAmountRow[], noteType: CreditNoteType): CreditNoteAmounts {
  let amountBeforeVatSatang = 0
  let vatSatang = 0
  let totalSatang = 0
  for (const row of rows) {
    if (row.status !== 'active' || (row.noteType ?? 'credit') !== noteType) continue
    amountBeforeVatSatang += row.amountBeforeVatSatang
    vatSatang += row.vatSatang
    totalSatang += row.totalSatang
  }
  return { amountBeforeVatSatang, vatSatang, totalSatang }
}

/** ผลรวมใบลดหนี้ที่ `active` เท่านั้น (ใบที่ยกเลิก/ใบเพิ่มหนี้ไม่นับ) */
export function sumActiveCreditNotes(rows: readonly CreditNoteAmountRow[]): CreditNoteAmounts {
  return sumActive(rows, 'credit')
}

/** ผลรวมใบเพิ่มหนี้ที่ `active` เท่านั้น (มติ PO U19) */
export function sumActiveDebitNotes(rows: readonly CreditNoteAmountRow[]): CreditNoteAmounts {
  return sumActive(rows, 'debit')
}

/** ยอดตามเอกสารของใบกำกับ = ยอดหน้าใบ − ใบลดหนี้ active + ใบเพิ่มหนี้ active */
export function netInvoiceAmounts(invoice: InvoiceAmounts, rows: readonly CreditNoteAmountRow[]): InvoiceAmounts {
  const credit = sumActiveCreditNotes(rows)
  const debit = sumActiveDebitNotes(rows)
  return {
    totalBeforeVatSatang: invoice.totalBeforeVatSatang - credit.amountBeforeVatSatang + debit.amountBeforeVatSatang,
    vatSatang: invoice.vatSatang - credit.vatSatang + debit.vatSatang,
    totalSatang: invoice.totalSatang - credit.totalSatang + debit.totalSatang,
  }
}

/**
 * ยอดที่ยังลดได้ = ยอดหน้าใบกำกับ − ใบลดหนี้ active (ไม่นับใบเพิ่มหนี้ — ตรงกับ trigger ระดับ DB:
 * ยกเลิกใบเพิ่มหนี้ทีหลังแล้วยอดลดหนี้ต้องไม่ทะลุใบกำกับ)
 */
export function creditableInvoiceBalance(invoice: InvoiceAmounts, rows: readonly CreditNoteAmountRow[]): InvoiceAmounts {
  const credit = sumActiveCreditNotes(rows)
  return {
    totalBeforeVatSatang: invoice.totalBeforeVatSatang - credit.amountBeforeVatSatang,
    vatSatang: invoice.vatSatang - credit.vatSatang,
    totalSatang: invoice.totalSatang - credit.totalSatang,
  }
}

/** ใบลดหนี้ใหม่ต้องไม่ทำให้ยอดรวมเกินใบกำกับ (ทั้งก่อน VAT และยอดรวม) — ใบเพิ่มหนี้ไม่ต้องเรียก */
export function assertWithinInvoiceBalance(
  invoice: InvoiceAmounts,
  existing: readonly CreditNoteAmountRow[],
  next: CreditNoteAmounts,
): void {
  const remaining = creditableInvoiceBalance(invoice, existing)
  if (next.amountBeforeVatSatang <= remaining.totalBeforeVatSatang && next.totalSatang <= remaining.totalSatang) return
  throw new SalesError('CREDIT_NOTE_EXCEEDS_INVOICE', {
    detail: `ขอลด ${next.amountBeforeVatSatang}/${next.totalSatang} คงเหลือ ${remaining.totalBeforeVatSatang}/${remaining.totalSatang}`,
    context: {
      remainingBeforeVatSatang: remaining.totalBeforeVatSatang,
      remainingTotalSatang: remaining.totalSatang,
    },
  })
}

// ── ยอดค้างของรอบวางบิล (มติ PO 07/10/2569 U171 · BUG-185) ─────────────────────

/**
 * ยอดรวมใบลดหนี้ที่บันทึกได้สูงสุด = ค่าน้อยกว่าระหว่าง "คงเหลือของใบกำกับ" กับ "ยอดค้างตามเอกสารของรอบวางบิล"
 * (ไม่ติดลบ — บิลชำระครบ/จ่ายเกิน ⇒ `0`) · ใช้ทั้งฟอร์ม (แสดงยอดที่ลดได้) และ server (ตรวจ) ⇒ ตัวเลขตรงกันเสมอ
 * · `billingOutstandingSatang` = `documentedOutstandingByBatch()` (ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้ − รับแล้ว/ภาษีลูกค้าหัก/ค่าธรรมเนียม)
 */
export function maxCreditNoteTotalSatang(invoiceCreditableTotalSatang: number, billingOutstandingSatang: number): number {
  return Math.max(0, Math.min(invoiceCreditableTotalSatang, billingOutstandingSatang))
}

/**
 * มติ PO U171 — ใบลดหนี้ต้องไม่เกิน**ยอดค้างตามเอกสาร**ของรอบวางบิล ณ ตอนบันทึก (บิลชำระครบไม่มียอดค้าง ⇒ บันทึกไม่ได้)
 * ระบบไม่มีที่เก็บเครดิตลูกค้า/การคืนเงิน ⇒ ส่วนที่เกินให้สำนักงานบัญชีจัดการคืนเงินนอกระบบ · ใบเพิ่มหนี้ไม่ต้องเรียก
 */
export function assertWithinBillingOutstanding(billingOutstandingSatang: number, next: CreditNoteAmounts): void {
  if (next.totalSatang <= billingOutstandingSatang) return
  const available = Math.max(0, billingOutstandingSatang)
  throw new SalesError('CREDIT_NOTE_EXCEEDS_OUTSTANDING', {
    detail: `ขอลด ${next.totalSatang} ยอดค้างของรอบ ${billingOutstandingSatang}`,
    context: { billingOutstandingSatang, maxCreditNoteTotalSatang: available, requestedTotalSatang: next.totalSatang },
    message:
      available === 0
        ? `รอบวางบิลนี้ไม่มียอดค้างชำระแล้ว จึงบันทึกใบลดหนี้ไม่ได้ (ขอลด ${fmtSatangSymbol(next.totalSatang)}) — ` +
          'ถ้าต้องคืนเงินให้ลูกค้า ขอให้สำนักงานบัญชีจัดการคืนเงินนอกระบบ'
        : `ยอดใบลดหนี้ ${fmtSatangSymbol(next.totalSatang)} เกินยอดค้างชำระของรอบวางบิล — ลดได้ไม่เกิน ${fmtSatangSymbol(available)} (รวมภาษี) · ` +
          'ถ้าต้องคืนเงินส่วนที่ลูกค้าชำระเกิน ขอให้สำนักงานบัญชีจัดการคืนเงินนอกระบบ',
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
  /** มีใบลดหนี้/ใบเพิ่มหนี้ active อ้างถึงแล้ว (1 Adjustment มีเอกสาร active ได้ใบเดียว) */
  hasActiveCreditNote: boolean
}

/**
 * Adjustment ที่อ้างถึงได้ = อนุมัติแล้ว + ชนิดตรงเอกสาร (ใบลดหนี้ ⇒ `decrease` · ใบเพิ่มหนี้ ⇒ `increase`)
 * + รอบวางบิลเดียวกับใบกำกับ + ยังไม่มีเอกสาร active อ้างถึง
 */
export function assertAdjustmentLinkable(
  adjustment: LinkableAdjustment,
  invoiceBillingBatchId: string,
  noteType: CreditNoteType = 'credit',
): void {
  const problems: string[] = []
  if (adjustment.status !== 'approved') problems.push(`status=${adjustment.status}`)
  if (adjustment.adjustmentType !== NOTE_TYPE_ADJUSTMENT[noteType]) problems.push(`type=${adjustment.adjustmentType}`)
  if (adjustment.billingBatchId !== invoiceBillingBatchId) problems.push('คนละรอบวางบิล')
  if (adjustment.hasActiveCreditNote) problems.push('มีเอกสารอ้างถึงแล้ว')
  if (problems.length === 0) return
  throw new SalesError('CREDIT_NOTE_ADJUSTMENT_MISMATCH', { detail: `${noteType}: ${problems.join(', ')}` })
}

/**
 * มติ PO U21 — ยอดก่อน VAT ของเอกสารไม่เท่ายอด Adjustment ที่อ้างถึง ⇒ **เตือน ไม่บล็อก**
 * (สำนักงานบัญชีอาจออกเอกสารรวม/แยกยอด) · คืนข้อความเตือนภาษาไทย หรือ `null` เมื่อยอดตรงกัน
 */
export function adjustmentAmountMismatchWarning(input: {
  noteType: CreditNoteType
  amountBeforeVatSatang: number
  adjustmentAmountSatang: number
  formatSatang: (satang: number) => string
}): string | null {
  if (input.amountBeforeVatSatang === input.adjustmentAmountSatang) return null
  return (
    `มูลค่าก่อนภาษีของ${CREDIT_NOTE_TYPE_LABEL[input.noteType]} (${input.formatSatang(input.amountBeforeVatSatang)}) ` +
    `ไม่เท่ากับยอดรายการปรับปรุงที่อ้างถึง (${input.formatSatang(input.adjustmentAmountSatang)}) — ` +
    'บันทึกให้แล้ว กรุณาตรวจกับเอกสารของสำนักงานบัญชีอีกครั้ง'
  )
}

export interface ActiveInvoiceNote {
  noteType: CreditNoteType
  creditNoteNumber: string
}

/**
 * มติ PO U18 — ยกเลิกใบกำกับที่ยังมีใบลดหนี้/ใบเพิ่มหนี้ active ไม่ได้ (ต้องยกเลิกเอกสารเหล่านั้นก่อน)
 * ข้อความบอกเลขเอกสารที่ต้องยกเลิกก่อน
 */
export function assertInvoiceHasNoActiveNotes(notes: readonly ActiveInvoiceNote[]): void {
  if (notes.length === 0) return
  const list = notes.map((note) => `${CREDIT_NOTE_TYPE_LABEL[note.noteType]} ${note.creditNoteNumber}`).join(', ')
  throw new SalesError('TAX_INVOICE_HAS_ACTIVE_NOTES', {
    detail: list,
    context: { notes: notes.map((note) => ({ noteType: note.noteType, number: note.creditNoteNumber })) },
    message: `ใบกำกับภาษีนี้ยังมีเอกสารที่อ้างถึงและใช้งานอยู่ — ต้องยกเลิกเอกสารต่อไปนี้ก่อน: ${list}`,
  })
}

/**
 * ชนิดเอกสารที่ Adjustment "รอ" อยู่ (มติ PO U14/U19) — อนุมัติแล้ว + รอบวางบิลมีใบกำกับ active + ยังไม่มีเอกสาร active
 * อ้างถึง ⇒ ลดยอด = `credit` (รอใบลดหนี้) · เพิ่มยอด = `debit` (รอใบเพิ่มหนี้) · ไม่เข้าเงื่อนไข = `null`
 */
export function awaitingNoteType(input: {
  status: AdjustmentStatus
  adjustmentType: AdjustmentType
  hasActiveInvoice: boolean
  hasActiveCreditNote: boolean
}): CreditNoteType | null {
  if (input.status !== 'approved' || !input.hasActiveInvoice || input.hasActiveCreditNote) return null
  return noteTypeForAdjustment(input.adjustmentType)
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

/**
 * staging E-016 (มติ PO 10/10/2569) — ปิดป้าย "รอใบลดหนี้" เป็น "จัดการนอกระบบ" ได้ไหม: รอใบลดหนี้อยู่จริง (ลดยอด)
 * และบิลไม่มียอดค้างตามเอกสารแล้ว (ชำระครบ ⇒ บันทึกใบลดหนี้ในระบบไม่ได้ตาม U171) · ยังมียอดค้าง = ต้องออกใบลดหนี้ตามปกติ
 */
export function canWaiveAwaitingCreditNote(input: { noteType: CreditNoteType | null; billOutstandingSatang: number }): boolean {
  return input.noteType === 'credit' && input.billOutstandingSatang <= 0
}

/** เหตุผลบังคับ (บันทึก/ยกเลิก) — คืนค่าที่ trim แล้ว · ว่าง = `CANCEL_REQUIRES_REASON` สำหรับการยกเลิก */
export function requireCreditNoteCancelReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new SalesError('CANCEL_REQUIRES_REASON', { detail: 'ยกเลิกใบลดหนี้ต้องมีเหตุผล' })
  return trimmed
}
