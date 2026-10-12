import { fmtDate } from '@/lib/format/datetime'
import { pctOfSatang, vatIncludedInSatang } from '@/lib/finance/satang'
import type { TaxInvoiceDocKind, VatMode } from '@/lib/generated/prisma/enums'
import { SalesError } from '@/lib/sales/errors'

/**
 * ใบเสร็จรับเงิน/ใบกำกับภาษี ตอนรับเงิน (มติ PO 06/10/2569 U95 + U96 #3/#7/#8/#9) — **pure ล้วน ไม่มี I/O**
 *
 * ### หลัก (ประมวลรัษฎากร ม.78/1(2) — ค่าบริการ)
 * ความรับผิด VAT เกิด **เมื่อได้รับชำระ** ตามยอดที่รับ ⇒ ตอนวางบิลออกแค่ "ใบแจ้งหนี้/ใบวางบิล" (ไม่ใช่เอกสารภาษี)
 * แล้วออก "ใบเสร็จรับเงิน/ใบกำกับภาษี" ใบเดียวตอนรับเงิน · ภาษีที่ลูกค้าหัก ณ ที่จ่ายนับเป็นการรับชำระ
 *
 * ### สูตรยอดบนใบ (`22` §6.8.2)
 * - ฐาน = ยอดก่อน VAT ตามใบแจ้งหนี้ (snapshot `sales_records`) − ยอดก่อน VAT ของใบ active ที่ออกไปแล้วของรอบ
 * - อัตรา = อัตรา ณ **วันรับเงิน** จาก `vat_rate_history` (resolve ที่ service — ห้าม hardcode)
 * - ยอดที่รับ (เงินโอน + ภาษีที่ลูกค้าหัก) ≥ ยอดคงเหลือรวม VAT ⇒ ออกเต็มยอดคงเหลือ
 *   (อัตราเดิมทั้งรอบ ⇒ VAT = VAT ตามใบแจ้งหนี้ − VAT ที่ออกไปแล้ว ⇒ ผลรวมทุกใบเท่าใบแจ้งหนี้เป๊ะ ไม่มีเศษสตางค์หลุด)
 * - รับบางส่วน ⇒ ยอดที่รับถือเป็นยอด**รวม** VAT: VAT = ยอด × อัตรา/(100+อัตรา) · ก่อน VAT = ยอด − VAT
 * - รับเกินยอดคงเหลือ ⇒ ส่วนเกินไม่ใช่การขาย (คืนใน `excessSatang` ให้ผู้เรียกบันทึก/แจ้ง)
 * - **มติ PO U169** — บิลที่ปิดด้วยการตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร (U144/U163) ⇒ ใบที่**ปิดยอด**ของรอบออก
 *   **เต็มยอดคงเหลือ** (VAT จากมูลค่าบริการเต็ม — ม.79) · ค่าธรรมเนียมเป็นค่าใช้จ่ายของเราแยกต่างหาก ไม่ใช่ส่วนลด
 *   ⇒ นับส่วนต่างที่ตัดเป็น "ชำระแล้ว" **เฉพาะเมื่อ** เงินรับใบนี้ + ส่วนต่าง ≥ ยอดคงเหลือ (ใบรับบางส่วนก่อนหน้า
 *   ไม่ดูดส่วนต่างไปใช้ — ใบเดียวที่ปิดยอดเป็นผู้รับส่วนต่างเสมอ ไม่ว่าออกใบตามลำดับใด)
 * - **มติ 12/10/2569 G3-01** — ใบลดหนี้ที่ลดใบเสร็จฯ (ลูกค้าชำระเต็มไปแล้ว) ⇒ ยอดที่ลดคือเงินที่ชำระไว้แล้วและถูกนำมาชำระ
 *   ยอดคงเหลือของรอบ ⇒ ใบถัดไป = ยอดที่รับ + เครดิตที่ยังไม่ถูกนำไปออกใบ ({@link unappliedCreditNoteSatang}) ไม่เกินยอดคงเหลือ
 *   ⇒ รอบรับชำระครบ: Σ ใบกำกับ − Σ ใบลดหนี้ + Σ ใบเพิ่มหนี้ = ยอดตามเอกสารของรอบ ทุกสตางค์
 *   · ใบเพิ่มหนี้เป็นเอกสารภาษีในตัว (ม.86/9) ⇒ เงินที่ชำระส่วนเพิ่มหนี้ไม่ออกใบซ้ำ (ใบปิดยอดออกเท่ายอดคงเหลือ ส่วนที่เกิน = `excessSatang`)
 */

export const RECEIPT_TAX_INVOICE_TITLE = 'ใบเสร็จรับเงิน/ใบกำกับภาษี'
export const RECEIPT_TAX_INVOICE_TITLE_EN = 'RECEIPT / TAX INVOICE'

/** ชื่อเอกสารตามชนิด (ใบเดิมก่อน U95 = "ใบกำกับภาษี") */
export const TAX_INVOICE_DOC_KIND_TITLE: Record<TaxInvoiceDocKind, string> = {
  tax_invoice: 'ใบกำกับภาษี',
  receipt_tax_invoice: RECEIPT_TAX_INVOICE_TITLE,
}

export const TAX_INVOICE_DOC_KIND_TITLE_EN: Record<TaxInvoiceDocKind, string> = {
  tax_invoice: 'TAX INVOICE',
  receipt_tax_invoice: RECEIPT_TAX_INVOICE_TITLE_EN,
}

export interface ReceiptInvoiceBasis {
  /** ยอดก่อน VAT ตามใบแจ้งหนี้ของรอบ (snapshot `sales_records`) */
  billedBeforeVatSatang: number
  /** VAT ตามใบแจ้งหนี้ (ยอดประมาณการ ณ วันวางบิล) */
  billedVatSatang: number
  /** อัตรา VAT ใน snapshot ของรายได้ในรอบ (`revenues.vat_rate_pct_used`) */
  billedVatRatesPct: readonly number[]
}

/** ใบ active ที่ออกไปแล้วของรอบเดียวกัน (ทั้งแบบเดิมและแบบตอนรับเงิน) */
export interface PriorInvoiceAmounts {
  amountBeforeVatSatang: number
  vatSatang: number
  /** `null` = ใบเดิมหลายอัตรา */
  vatRatePct: number | null
  /** มติ 12/10/2569 G3-01 — ยอดรวมบนใบ (ไม่ส่ง = ก่อน VAT + VAT) */
  totalSatang?: number
  /**
   * มติ 12/10/2569 G3-01 — ยอดที่รับชำระของเงินรับที่ใบนี้ออกให้ (เงินโอน + ภาษีที่ลูกค้าหัก)
   * · ใบกำกับแบบเดิม/ไม่ผูกเงินรับ = `null`/ไม่ส่ง (ใบลดหนี้ที่อ้างใบนั้นไม่นับเป็นเครดิต)
   */
  receivedSatang?: number | null
  /** มติ 12/10/2569 G3-01 — ผลรวมยอดรวมของ**ใบลดหนี้** active ที่อ้างใบนี้ (ไม่รวมใบเพิ่มหนี้) */
  creditNoteTotalSatang?: number
}

/**
 * มติ 12/10/2569 G3-01 — เครดิตจากใบลดหนี้ที่ยังไม่ถูกนำไปออกใบกำกับ
 *
 * ใบเสร็จรับเงิน/ใบกำกับภาษีออกเมื่อรับเงิน ⇒ ใบที่ถูกลดหนี้คือใบที่ลูกค้า**ชำระเต็มไปแล้ว** ·
 * ยอดที่ลดจึงเป็นเงินที่ลูกค้าจ่ายไว้แล้วและถูกนำมาชำระยอดคงเหลือของรอบ (เป็นการรับชำระสำหรับมูลค่าที่ยังไม่ออกใบ)
 * - เครดิตทั้งหมด = Σ ใบลดหนี้ active ที่อ้างใบเสร็จฯ (`receivedSatang ≠ null`)
 * - ใช้ไปแล้ว     = Σ max(0, ยอดใบ − ยอดที่รับของใบนั้น) ของใบเสร็จฯ ก่อนหน้า (ใบที่รวมเครดิต/ส่วนต่างไว้)
 * - คงเหลือ       = max(0, เครดิตทั้งหมด − ใช้ไปแล้ว)
 * (ใบที่ปิดยอดซึ่งรวมค่าธรรมเนียมไว้ด้วยนับเป็น "ใช้ไปแล้ว" ได้ — หลังใบปิดยอดไม่มีมูลค่าให้ออกใบอีก ⇒ ไม่กระทบผล)
 */
export function unappliedCreditNoteSatang(prior: readonly PriorInvoiceAmounts[]): number {
  let credit = 0
  let applied = 0
  for (const row of prior) {
    if (row.receivedSatang === undefined || row.receivedSatang === null) continue
    credit += row.creditNoteTotalSatang ?? 0
    const total = row.totalSatang ?? row.amountBeforeVatSatang + row.vatSatang
    applied += Math.max(0, total - row.receivedSatang)
  }
  return Math.max(0, credit - applied)
}

export interface ReceiptInvoiceInput {
  basis: ReceiptInvoiceBasis
  prior: readonly PriorInvoiceAmounts[]
  /** ยอดที่ถือว่ารับชำระ = เงินโอนเข้า + ภาษีที่ลูกค้าหัก ณ ที่จ่าย */
  paidSatang: number
  /** อัตรา VAT ณ วันรับเงิน */
  vatRatePct: number
  /**
   * มติ PO U169 — ส่วนต่างที่รอบวางบิลตัดเป็นค่าธรรมเนียมธนาคารแล้ว (`billing_batches.bank_fee_written_off_satang`)
   * · ไม่มีการตัด = `0` (ค่าเริ่มต้น — พฤติกรรมเดิม)
   */
  bankFeeWrittenOffSatang?: number
}

export interface ReceiptInvoiceAmounts {
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  vatRatePct: number
  /** ใบนี้ปิดยอดคงเหลือของรอบครบแล้ว */
  coversRemainder: boolean
  /** รับเกินยอดคงเหลือ (ไม่นำมาออกเอกสาร) */
  excessSatang: number
  /** มติ PO U169 — ส่วนต่างค่าธรรมเนียมธนาคารที่ใบนี้รวมไว้ในยอดเต็ม (ใบรับบางส่วน = `0`) */
  bankFeeSatang: number
  /** มติ 12/10/2569 G3-01 — เครดิตจากใบลดหนี้ที่ใบนี้รวมไว้ในยอด (ไม่มี = `0`) */
  creditAppliedSatang: number
}

function sameRate(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

export function receiptInvoiceAmounts(input: ReceiptInvoiceInput): ReceiptInvoiceAmounts {
  const { basis, prior, paidSatang, vatRatePct } = input
  const bankFee = input.bankFeeWrittenOffSatang ?? 0
  if (!Number.isInteger(bankFee) || bankFee < 0) {
    throw new RangeError(`ส่วนต่างค่าธรรมเนียมธนาคารต้องเป็นจำนวนเต็มสตางค์ไม่ติดลบ (ได้ ${bankFee})`)
  }
  const priorBefore = prior.reduce((sum, row) => sum + row.amountBeforeVatSatang, 0)
  const priorVat = prior.reduce((sum, row) => sum + row.vatSatang, 0)
  const remainingBefore = basis.billedBeforeVatSatang - priorBefore

  if (!Number.isInteger(paidSatang) || paidSatang <= 0 || remainingBefore <= 0) {
    throw new SalesError('TAX_INVOICE_NOTHING_TO_INVOICE', {
      detail: `paid=${paidSatang} remaining_before_vat=${remainingBefore}`,
    })
  }

  const rateUnchanged =
    basis.billedVatRatesPct.length > 0 &&
    basis.billedVatRatesPct.every((rate) => sameRate(rate, vatRatePct)) &&
    prior.every((row) => row.vatRatePct !== null && sameRate(row.vatRatePct, vatRatePct))
  const remainingVat = rateUnchanged
    ? Math.max(0, basis.billedVatSatang - priorVat)
    : pctOfSatang(remainingBefore, vatRatePct)
  const remainingTotal = remainingBefore + remainingVat
  // มติ 12/10/2569 G3-01 — เครดิตจากใบลดหนี้ (เงินที่ลูกค้าชำระไว้แล้ว) นับเป็นการรับชำระก่อนค่าธรรมเนียมที่ตัด
  const credit = unappliedCreditNoteSatang(prior)

  if (paidSatang + credit + bankFee >= remainingTotal) {
    const creditApplied = Math.min(credit, Math.max(0, remainingTotal - paidSatang))
    return {
      totalBeforeVatSatang: remainingBefore,
      vatSatang: remainingVat,
      totalSatang: remainingTotal,
      vatRatePct,
      coversRemainder: true,
      excessSatang: Math.max(0, paidSatang - remainingTotal),
      bankFeeSatang: Math.max(0, remainingTotal - paidSatang - creditApplied),
      creditAppliedSatang: creditApplied,
    }
  }

  // รับบางส่วน — ยอดที่รับ + เครดิตคงเหลือ (< ยอดคงเหลือ) ถือเป็นยอดรวม VAT
  const invoiceTotal = paidSatang + credit
  const vatSatang = vatIncludedInSatang(invoiceTotal, vatRatePct)
  return {
    totalBeforeVatSatang: invoiceTotal - vatSatang,
    vatSatang,
    totalSatang: invoiceTotal,
    vatRatePct,
    coversRemainder: false,
    excessSatang: 0,
    bankFeeSatang: 0,
    creditAppliedSatang: credit,
  }
}

/**
 * U96 #3 — ผู้ขาย (องค์กรเรา) จด VAT ⇒ ห้ามออกใบที่ VAT = 0 · รอบที่รายได้ snapshot เป็น `no_vat`
 * ออกใบเสร็จรับเงิน/ใบกำกับภาษีไม่ได้จนกว่านักบัญชียืนยันกรณียกเว้น
 */
export function assertVatApplicable(input: { vatModes: readonly VatMode[]; vatRatePct: number; vatSatang: number }): void {
  if (input.vatModes.includes('no_vat') || input.vatRatePct <= 0 || input.vatSatang <= 0) {
    throw new SalesError('TAX_INVOICE_NO_VAT_COMPANY', {
      detail: `vat_modes=${input.vatModes.join(',')} rate=${input.vatRatePct} vat=${input.vatSatang}`,
    })
  }
}

/**
 * U96 #7 — วันที่เอกสาร ≤ วันนี้ (ปฏิทินไทย) และ ≥ วันที่ของเอกสารเลขก่อนหน้า (เลขเดินตามลำดับการออก)
 * · ใบเสร็จรับเงิน/ใบกำกับภาษีต้องไม่ลงวันที่ก่อนวันรับเงิน (`notBefore`)
 * ทุกค่าเป็นวันที่ล้วน (เที่ยงคืน UTC แบบคอลัมน์ `DATE`)
 */
export function assertInvoiceDateValid(input: {
  invoiceDate: Date
  today: Date
  previousInvoiceDate: Date | null
  previousInvoiceNumber?: string | null
  notBefore?: Date | null
}): void {
  const day = input.invoiceDate.getTime()
  if (day > input.today.getTime()) {
    throw new SalesError('TAX_INVOICE_DATE_IN_FUTURE', { detail: `invoice_date=${fmtDate(input.invoiceDate)}` })
  }
  if (input.notBefore !== undefined && input.notBefore !== null && day < input.notBefore.getTime()) {
    throw new SalesError('TAX_INVOICE_DATE_OUT_OF_SEQUENCE', {
      detail: `invoice_date=${fmtDate(input.invoiceDate)} before received_date=${fmtDate(input.notBefore)}`,
      message: `วันที่เอกสารต้องไม่ก่อนวันรับเงิน (${fmtDate(input.notBefore)})`,
    })
  }
  if (input.previousInvoiceDate !== null && day < input.previousInvoiceDate.getTime()) {
    const ref = input.previousInvoiceNumber ? `เลขที่ ${input.previousInvoiceNumber} ` : ''
    throw new SalesError('TAX_INVOICE_DATE_OUT_OF_SEQUENCE', {
      detail: `invoice_date=${fmtDate(input.invoiceDate)} previous=${fmtDate(input.previousInvoiceDate)}`,
      message:
        `วันที่เอกสาร (${fmtDate(input.invoiceDate)}) ก่อนวันที่ของเอกสาร${ref}ลงวันที่ ${fmtDate(input.previousInvoiceDate)} — ` +
        'เลขที่ต้องเรียงตามวันที่ เลือกวันที่เอกสารให้ไม่ก่อนใบล่าสุด',
    })
  }
}

/** U96 #8 — ข้อความบนใบที่ออกแทนใบที่ยกเลิก */
export function replacementNoteOf(replaced: {
  invoiceNumber: string
  invoiceDate: Date
  cancelReason: string | null
} | null): string | null {
  if (replaced === null) return null
  const reason = (replaced.cancelReason ?? '').trim() || 'ไม่ระบุเหตุผล'
  return `ออกแทนฉบับเลขที่ ${replaced.invoiceNumber} ลงวันที่ ${fmtDate(replaced.invoiceDate)} เนื่องจาก ${reason}`
}

/** รายละเอียดบริการบนใบเสร็จรับเงิน/ใบกำกับภาษี — อ้างรอบวางบิล + บอกว่าเป็นการรับชำระบางส่วน */
export function receiptInvoiceDescriptionOf(input: {
  periodLabel: string
  billingBatchNumber: string
  coversRemainder: boolean
}): string {
  const base = `ค่าบริการติดตามทรัพย์ รอบเดือน ${input.periodLabel.trim()} (ใบแจ้งหนี้ ${input.billingBatchNumber})`
  return input.coversRemainder ? base : `${base} — รับชำระบางส่วน`
}

export interface ReceiptLedgerInvoice {
  id: string
  status: 'active' | 'cancelled'
  totalSatang: number
  createdAt: Date
  /**
   * มติ 12/10/2569 G3-01 — ยอดที่รับของเงินรับที่ใบนี้ออกให้ (เงินโอน + ภาษีที่ลูกค้าหัก)
   * · ไม่ส่ง/`null` (ใบกำกับแบบเดิม) ⇒ ถือยอดบนใบเป็นยอดที่ชำระ (พฤติกรรมเดิม)
   */
  receivedSatang?: number | null
}

/** ใบลดหนี้/ใบเพิ่มหนี้ของรอบ (อ้างใบกำกับใดก็ได้ในรอบเดียวกัน) */
export interface ReceiptLedgerNote {
  noteType: 'credit' | 'debit'
  status: 'active' | 'cancelled'
  totalSatang: number
  createdAt: Date
}

export interface ReceiptSettlement {
  /** ครั้งที่รับชำระ (ลำดับใบ active ตามเวลาที่ออก) */
  sequence: number
  /** ยอดค้างจริงของรอบหลังใบนี้ = ยอดตามเอกสาร (ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้ ณ เวลาออกใบ) − ที่รับถึงใบนี้ */
  outstandingSatang: number
  /** มติ PO U169 — ค่าธรรมเนียมที่ตัดซึ่งใบนี้รวมไว้ (เฉพาะใบที่ปิดยอดของรอบ) */
  bankFeeSatang: number
  /** มติ 12/10/2569 G3-01 — เครดิตจากใบลดหนี้ที่ใบนี้รวมไว้ = ยอดใบ − ยอดที่รับ − ค่าธรรมเนียม */
  creditAppliedSatang: number
}

/**
 * การชำระที่ใบนี้รับรู้ (มติ 12/10/2569 G3-01) — **pure** · ใช้ประกอบข้อความ "ครั้งที่ / ยอดคงค้าง" และแถวหักบนใบ
 * - ใบ active เรียงตามเวลาที่ออก · ใบที่ผลรวมยอดถึงยอดใบแจ้งหนี้เป็นใบแรก = ใบปิดยอด (รับค่าธรรมเนียมที่ตัด)
 * - ส่วนต่าง = max(0, ยอดใบ − ยอดที่รับ) ⇒ ค่าธรรมเนียม = ใบปิดยอด ? min(ค่าธรรมเนียมที่ตัด, ส่วนต่าง) : 0 ·
 *   เครดิตใบลดหนี้ = ส่วนต่าง − ค่าธรรมเนียม
 * - ยอดค้าง = max(0, ใบแจ้งหนี้ − Σ ใบลดหนี้ + Σ ใบเพิ่มหนี้ (active · บันทึกไม่หลังเวลาออกใบนี้)
 *   − Σ (ยอดที่รับ + ค่าธรรมเนียม) ของใบถึงใบนี้) ⇒ พิมพ์ซ้ำภายหลังได้ตัวเลขเดิม
 * · ใบนี้ไม่ active / ไม่พบ ⇒ `null`
 */
export function receiptSettlementOf(input: {
  invoiceId: string
  billedTotalSatang: number
  bankFeeWrittenOffSatang?: number
  invoices: readonly ReceiptLedgerInvoice[]
  notes?: readonly ReceiptLedgerNote[]
}): ReceiptSettlement | null {
  const active = input.invoices
    .filter((invoice) => invoice.status === 'active')
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const index = active.findIndex((invoice) => invoice.id === input.invoiceId)
  if (index === -1) return null
  const batchFee = input.bankFeeWrittenOffSatang ?? 0

  let invoicedSoFar = 0
  let closed = false
  let receivedSoFar = 0
  let bankFeeSatang = 0
  let creditAppliedSatang = 0
  for (const invoice of active.slice(0, index + 1)) {
    invoicedSoFar += invoice.totalSatang
    const isClosing = !closed && invoicedSoFar >= input.billedTotalSatang
    if (isClosing) closed = true
    const received = invoice.receivedSatang ?? invoice.totalSatang
    const gap = Math.max(0, invoice.totalSatang - received)
    const fee = isClosing ? Math.min(batchFee, gap) : 0
    receivedSoFar += received + fee
    bankFeeSatang = fee
    creditAppliedSatang = gap - fee
  }

  const asOf = active[index]?.createdAt.getTime() ?? 0
  let documented = input.billedTotalSatang
  for (const note of input.notes ?? []) {
    if (note.status !== 'active' || note.createdAt.getTime() > asOf) continue
    documented += note.noteType === 'debit' ? note.totalSatang : -note.totalSatang
  }

  return {
    sequence: index + 1,
    outstandingSatang: Math.max(0, documented - receivedSoFar),
    bankFeeSatang,
    creditAppliedSatang,
  }
}

/**
 * ลำดับการรับชำระของใบในรอบวางบิลเดียวกัน (มติ PO U100 — ข้อความ "รับชำระบางส่วนครั้งที่ …")
 * — นับเฉพาะใบ `active` ของรายการขายเดียวกัน เรียงตามเวลาที่ออก · ยอดคงค้าง = ยอดค้างจริงหลังใบลดหนี้/ใบเพิ่มหนี้
 *   ({@link receiptSettlementOf} — มติ 12/10/2569 G3-01 · เดิมคิดจากผลรวมใบ ⇒ รอบที่มีใบลดหนี้พิมพ์ยอดค้างเกินจริง)
 * · ใบนี้ไม่ active / ไม่พบ ⇒ `null` · ใบเดียวรับครบยอด ⇒ `null` (ไม่ต้องพิมพ์ข้อความ)
 */
export function receiptInstallmentOf(input: {
  invoiceId: string
  billedTotalSatang: number
  bankFeeWrittenOffSatang?: number
  invoices: readonly ReceiptLedgerInvoice[]
  notes?: readonly ReceiptLedgerNote[]
}): { sequence: number; outstandingSatang: number } | null {
  const settlement = receiptSettlementOf(input)
  if (settlement === null) return null
  const { sequence, outstandingSatang } = settlement
  if (sequence === 1 && outstandingSatang === 0) return null
  return { sequence, outstandingSatang }
}
