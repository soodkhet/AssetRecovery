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

  if (paidSatang + bankFee >= remainingTotal) {
    return {
      totalBeforeVatSatang: remainingBefore,
      vatSatang: remainingVat,
      totalSatang: remainingTotal,
      vatRatePct,
      coversRemainder: true,
      excessSatang: Math.max(0, paidSatang - remainingTotal),
      bankFeeSatang: Math.max(0, remainingTotal - paidSatang),
    }
  }

  const vatSatang = vatIncludedInSatang(paidSatang, vatRatePct)
  return {
    totalBeforeVatSatang: paidSatang - vatSatang,
    vatSatang,
    totalSatang: paidSatang,
    vatRatePct,
    coversRemainder: false,
    excessSatang: 0,
    bankFeeSatang: 0,
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

/**
 * ลำดับการรับชำระของใบในรอบวางบิลเดียวกัน (มติ PO U100 — ข้อความ "รับชำระบางส่วนครั้งที่ …")
 * — นับเฉพาะใบ `active` ของรายการขายเดียวกัน เรียงตามเวลาที่ออก · ยอดคงค้าง = ยอดตามใบแจ้งหนี้ − ผลรวมใบถึงใบนี้ (ไม่ติดลบ)
 * · ใบนี้ไม่ active / ไม่พบ ⇒ `null` · ใบเดียวรับครบยอด ⇒ `null` (ไม่ต้องพิมพ์ข้อความ)
 */
export function receiptInstallmentOf(input: {
  invoiceId: string
  billedTotalSatang: number
  invoices: ReadonlyArray<{ id: string; status: 'active' | 'cancelled'; totalSatang: number; createdAt: Date }>
}): { sequence: number; outstandingSatang: number } | null {
  const active = input.invoices
    .filter((invoice) => invoice.status === 'active')
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const index = active.findIndex((invoice) => invoice.id === input.invoiceId)
  if (index === -1) return null
  const invoicedSoFar = active.slice(0, index + 1).reduce((sum, invoice) => sum + invoice.totalSatang, 0)
  const outstandingSatang = Math.max(0, input.billedTotalSatang - invoicedSoFar)
  const sequence = index + 1
  if (sequence === 1 && outstandingSatang === 0) return null
  return { sequence, outstandingSatang }
}
