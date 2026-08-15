import { fmtDate } from '@/lib/format/datetime'
import { fmtSatang } from '@/lib/format/money'
import type { InvoiceDeliveryFormat, TaxInvoiceStatus } from '@/lib/generated/prisma/enums'
import { bahtInWords } from '@/lib/payout/baht-text'
import { toBangkokDateOnly } from '@/lib/revenue/revenue'
import { SalesError } from '@/lib/sales/errors'

/**
 * กติกาของบัญชีขาย/ใบกำกับภาษี (ไฟล์ 31) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### กติกาที่ห้ามหลุด
 * - **เลขที่ใบกำกับภาษีเดินโดยระบบเท่านั้น ห้ามกรอกมือ ห้าม gap** (`31` §10) ⇒ ที่นี่ไม่มีตัวสร้าง
 *   เลข — ตัวจริงคือ `reserveNextInvoiceNumber()` (`lib/settings/queries/numbering.ts`, Phase 1.10)
 *   ซึ่งเดินเลขแบบ atomic ใน `$transaction` เดียวกับการ insert
 * - **ไม่มีสถานะ draft** (`31` §7.2 v2 · `02` §3 enum `tax_invoice_status`) — สร้าง = `active` ทันที
 *   · `cancelled` เป็น terminal (ห้ามลบ ห้าม reverse — `02` §13)
 * - ยกเลิกแล้ว**เลขเดิมไม่ recycle** — ใบใหม่ได้เลขถัดไปเสมอ (`31` §9.1 · §16)
 * - เงินทุกช่องเป็น satang จาก snapshot ของ `sales_records` — ที่นี่ทำได้แค่ *รวม* และ *แปลงเป็น
 *   ข้อความ* ห้ามคิด VAT ใหม่บนเอกสาร (Rule 01 · VAT snapshot มาจาก `19` §6.3)
 *
 * ### สิ่งที่ยังไม่มีในสคีมา (`02` ชนะไฟล์ 31 ตามลำดับเอกสารขัดกัน)
 * `tax_invoices` ไม่มีคอลัมน์ `delivery_format` ⇒ รูปแบบส่งเอกสารอ่านจาก
 * `finance_companies.default_invoice_delivery_format` (`10` §7.1) แบบ read-through
 * — ยังเลือกรายใบไม่ได้จนกว่าจะมีมติเพิ่มคอลัมน์ (บันทึกไว้ที่ `docs/02_OPEN_DECISIONS.md` D13)
 */

// ── สิทธิ์ (`25` §7.3–7.5 · `31` §12) ────────────────────────────────────────

/** ออก/ยกเลิกใบกำกับภาษี = บัญชีเท่านั้น (`25` §7.4) */
export const MANAGE_TAX_INVOICE = 'manage_tax_invoice'
/** รายการขาย/เงินรับ — บัญชี manage · การเงิน view (`25` §7.5) */
export const MANAGE_SALES_EXPENSES = 'manage_sales_expenses'

/** ผู้ที่เปิดดูรายการขาย/ใบกำกับภาษี/เงินรับได้ (`31` §12 — การเงินอ่านอย่างเดียว) */
export const SALES_READ_CAPABILITIES = [MANAGE_SALES_EXPENSES, MANAGE_TAX_INVOICE] as const

// ── ป้ายข้อความ ─────────────────────────────────────────────────────────────

export const TAX_INVOICE_STATUS_LABEL: Record<TaxInvoiceStatus, string> = {
  active: 'ใช้งาน',
  cancelled: 'ยกเลิก',
}

export const INVOICE_DELIVERY_FORMAT_LABEL: Record<InvoiceDeliveryFormat, string> = {
  e_tax_invoice: 'e-Tax Invoice (ส่งเข้าระบบกรมสรรพากร)',
  paper_pdf: 'กระดาษ/PDF (พิมพ์ส่งไปรษณีย์หรืออีเมล)',
}

export const TAX_INVOICE_TITLE = 'ใบกำกับภาษี'
export const TAX_INVOICE_TITLE_EN = 'TAX INVOICE'

/** รายละเอียดบริการบนใบกำกับภาษี (`31` §7.2 ตัวอย่าง "ค่าบริการติดตามทรัพย์ รอบเดือน มิถุนายน 2569") */
export function invoiceDescriptionOf(periodLabel: string): string {
  return `ค่าบริการติดตามทรัพย์ รอบเดือน ${periodLabel.trim()}`
}

/**
 * วันที่ออกใบกำกับภาษีเริ่มต้น = **วันนี้ตามปฏิทินไทย** ในรูปเที่ยงคืน UTC (รูปเดียวกับ
 * `dateOnlySchema()` และคอลัมน์ `DATE`) — ห้ามใช้ `new Date()` ตรง ๆ เพราะหลัง 17:00 น. ไทย
 * วัน UTC จะยังเป็นเมื่อวาน ⇒ เลขปีของโหมด `yearly_reset` และวันบนเอกสารจะเพี้ยน (E7)
 */
export function defaultInvoiceDate(now: Date = new Date()): Date {
  return toBangkokDateOnly(now)
}

// ── ยอดรวมของรายการขาย (`31` §6.1 — sync 1:1 จาก Billing Batch) ─────────────

export interface SalesAmountSource {
  grossSatang: number
  vatSatang: number
  totalSatang: number
}

export interface SalesAmounts {
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

/**
 * รวมยอดของรอบวางบิลเป็นยอดบันทึกขาย — ยอดมาจาก snapshot ของ `revenues` (`19` §6.3)
 * ⚠️ ยาม `total = gross + vat` ของทุกใบ: ถ้าไม่ตรงแปลว่าข้อมูลต้นทางเสีย ห้ามออกใบกำกับภาษีต่อ
 */
export function summarizeSalesAmounts(rows: readonly SalesAmountSource[]): SalesAmounts {
  let totalBeforeVatSatang = 0
  let vatSatang = 0
  let totalSatang = 0

  for (const row of rows) {
    if (row.totalSatang !== row.grossSatang + row.vatSatang) {
      throw new RangeError(
        `summarizeSalesAmounts: ยอดรายได้ไม่สมดุล (gross ${row.grossSatang} + vat ${row.vatSatang} ≠ total ${row.totalSatang})`,
      )
    }
    totalBeforeVatSatang += row.grossSatang
    vatSatang += row.vatSatang
    totalSatang += row.totalSatang
  }

  return { totalBeforeVatSatang, vatSatang, totalSatang }
}

// ── ฟิลด์บังคับตามกฎหมาย (`28` §6.2 — 7 ข้อ) ────────────────────────────────

export interface TaxInvoicePartyInput {
  name: string | null
  taxId: string | null
  address: string | null
}

export interface TaxInvoiceFieldInput {
  seller: TaxInvoicePartyInput
  /** ผู้ขายต้องจด VAT จึงออกใบกำกับภาษีแบบเต็มรูปได้ (`31` §6.2) */
  sellerVatRegistered: boolean
  buyer: TaxInvoicePartyInput
  description: string
  amounts: SalesAmounts
}

/** เลขประจำตัวผู้เสียภาษี = ตัวเลข 13 หลักถ้วน (แบบเดียวกับที่ export ของ `37` บังคับ) */
function isTaxId(value: string | null): boolean {
  return value !== null && /^\d{13}$/.test(value.trim())
}

function isFilled(value: string | null): boolean {
  return value !== null && value.trim() !== ''
}

/**
 * รายชื่อฟิลด์บังคับที่ยังขาด — ชื่อ field ใช้ snake_case ตาม `31` §7.2 เพื่อให้ FE ชี้จุดแก้ได้ตรง
 * (ว่าง = ครบ พร้อมออกเอกสาร)
 */
export function missingTaxInvoiceFields(input: TaxInvoiceFieldInput): string[] {
  const missing: string[] = []

  if (!isFilled(input.seller.name)) missing.push('seller_name')
  if (!isTaxId(input.seller.taxId)) missing.push('seller_tax_id')
  if (!isFilled(input.seller.address)) missing.push('seller_address')
  if (!input.sellerVatRegistered) missing.push('seller_vat_registered')

  if (!isFilled(input.buyer.name)) missing.push('buyer_name')
  if (!isTaxId(input.buyer.taxId)) missing.push('buyer_tax_id')
  if (!isFilled(input.buyer.address)) missing.push('buyer_address')

  if (!isFilled(input.description)) missing.push('description')

  const { totalBeforeVatSatang, vatSatang, totalSatang } = input.amounts
  if (totalBeforeVatSatang <= 0) missing.push('amount_before_vat')
  if (vatSatang < 0) missing.push('vat_amount')
  if (totalSatang !== totalBeforeVatSatang + vatSatang) missing.push('total_amount')

  return missing
}

/** ตรวจก่อน "ออก" ใบกำกับภาษีจริง — ไม่ครบ = reject (`31` §11 `TAX_INVOICE_FIELD_MISSING`) */
export function assertTaxInvoiceFieldsComplete(input: TaxInvoiceFieldInput): void {
  const missing = missingTaxInvoiceFields(input)
  if (missing.length === 0) return
  throw new SalesError('TAX_INVOICE_FIELD_MISSING', {
    detail: `ฟิลด์บังคับไม่ครบ: ${missing.join(', ')}`,
    context: { missingFields: missing },
  })
}

// ── State machine ของใบกำกับภาษี (`23` §6.10 · `31` §9.1) ────────────────────

/** ออกใบใหม่ได้เมื่อรายการขายนั้นยังไม่มีใบที่ `active` (ใบที่ยกเลิกแล้วไม่นับ) */
export function assertIssuable(activeInvoiceNumber: string | null): void {
  if (activeInvoiceNumber === null) return
  throw new SalesError('TAX_INVOICE_ALREADY_ISSUED', {
    detail: `มีใบกำกับภาษี ${activeInvoiceNumber} ใช้งานอยู่`,
    context: { invoiceNumber: activeInvoiceNumber },
  })
}

/** `active → cancelled` เท่านั้น — `cancelled` เป็น terminal (ห้ามลบ/ห้าม reverse) */
export function assertCancellable(status: TaxInvoiceStatus): void {
  if (status === 'active') return
  throw new SalesError('TAX_INVOICE_INVALID_STATUS', {
    detail: `cancel at ${status}`,
    context: { currentStatus: status },
  })
}

/** เหตุผลยกเลิกบังคับเสมอ (`31` §11) — คืนค่าที่ trim แล้วให้ผู้เรียกเก็บลง `cancel_reason` */
export function requireCancelReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new SalesError('CANCEL_REQUIRES_REASON')
  return trimmed
}

/**
 * ยามความต่อเนื่องของเลขที่ (`31` §11 `INVOICE_NUMBER_GAP`) — เลขที่จองได้ต้องเป็นลำดับถัดไปพอดี
 * เทียบกับลำดับสูงสุดที่เคยออกในโหมดเดียวกัน (`0` = ยังไม่เคยออก)
 */
export function assertNoNumberGap(reservedSequence: number, previousSequence: number): void {
  if (reservedSequence === previousSequence + 1) return
  throw new SalesError('INVOICE_NUMBER_GAP', {
    detail: `จองเลขลำดับ ${reservedSequence} แต่ลำดับล่าสุดคือ ${previousSequence}`,
  })
}

// ── แบบข้อมูลของเอกสาร PDF (`28` §6.2) ──────────────────────────────────────

export interface TaxInvoiceParty {
  name: string
  taxId: string
  address: string
  phone: string | null
}

export interface TaxInvoiceDocSource {
  invoiceNumber: string
  invoiceDate: Date
  status: TaxInvoiceStatus
  cancelReason: string | null
  cancelledAt: Date | null
  deliveryFormat: InvoiceDeliveryFormat
  seller: TaxInvoiceParty
  buyer: TaxInvoiceParty
  description: string
  periodLabel: string
  amounts: SalesAmounts
  /** อัตรา VAT ที่ snapshot ไว้ในรายได้ของรอบนี้ (`19` §6.3) — หลายอัตรา = ไม่ระบุ % บนหัวคอลัมน์ */
  vatRatesPct: readonly string[]
}

/** เอกสารที่ประกอบเป็นข้อความครบแล้ว — component PDF ห้าม format/คำนวณซ้ำ (Rule 01) */
export interface TaxInvoiceDoc {
  title: string
  titleEn: string
  invoiceNumber: string
  invoiceDateLabel: string
  statusLabel: string
  isCancelled: boolean
  cancelNote: string | null
  deliveryFormatLabel: string
  seller: TaxInvoiceParty
  buyer: TaxInvoiceParty
  description: string
  periodLabel: string
  quantityText: string
  unitPriceText: string
  amountBeforeVatText: string
  vatLabel: string
  vatText: string
  totalText: string
  totalInWordsText: string
  fileName: string
}

/** หัวคอลัมน์ VAT — อัตราเดียวกันทั้งรอบจึงระบุ % ได้ (`19` §6.3 snapshot ต่อใบรายได้) */
export function vatLabelOf(vatRatesPct: readonly string[]): string {
  const unique = [...new Set(vatRatesPct.map((rate) => rate.trim()).filter((rate) => rate !== ''))]
  if (unique.length !== 1) return 'ภาษีมูลค่าเพิ่ม'
  const rate = Number(unique[0])
  if (!Number.isFinite(rate)) return 'ภาษีมูลค่าเพิ่ม'
  return `ภาษีมูลค่าเพิ่ม ${String(Number(rate.toFixed(2)))}%`
}

export function buildTaxInvoiceDoc(source: TaxInvoiceDocSource): TaxInvoiceDoc {
  const isCancelled = source.status === 'cancelled'
  const beforeVat = source.amounts.totalBeforeVatSatang

  return {
    title: TAX_INVOICE_TITLE,
    titleEn: TAX_INVOICE_TITLE_EN,
    invoiceNumber: source.invoiceNumber,
    invoiceDateLabel: fmtDate(source.invoiceDate),
    statusLabel: TAX_INVOICE_STATUS_LABEL[source.status],
    isCancelled,
    cancelNote: isCancelled
      ? `ยกเลิกเมื่อ ${fmtDate(source.cancelledAt)} — ${(source.cancelReason ?? '').trim() || 'ไม่ระบุเหตุผล'}`
      : null,
    deliveryFormatLabel: INVOICE_DELIVERY_FORMAT_LABEL[source.deliveryFormat],
    seller: source.seller,
    buyer: source.buyer,
    description: source.description,
    periodLabel: source.periodLabel,
    quantityText: '1',
    unitPriceText: fmtSatang(beforeVat),
    amountBeforeVatText: fmtSatang(beforeVat),
    vatLabel: vatLabelOf(source.vatRatesPct),
    vatText: fmtSatang(source.amounts.vatSatang),
    totalText: fmtSatang(source.amounts.totalSatang),
    totalInWordsText: bahtInWords(source.amounts.totalSatang),
    fileName: `${source.invoiceNumber}.pdf`,
  }
}
