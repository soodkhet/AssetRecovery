import type {
  BankMatchStatus,
  BillingBatchStatus,
  TaxInvoiceDocKind,
  TaxInvoiceStatus,
} from '@/lib/generated/prisma/enums'

/**
 * DTO ของบัญชีขายและเงินรับ (ไฟล์ 31 §8) — เงินเป็น satang เสมอ, วันที่เป็น ISO UTC
 * (ฝั่งจอแปลงเป็น พ.ศ. ด้วย `fmtDate` — Rule 01)
 */

/** ใบกำกับภาษีแบบย่อ ติดไปกับแถวรายการขาย */
export interface TaxInvoiceSummaryDto {
  id: string
  /** U95 — `tax_invoice` (ใบเดิมตอนวางบิล) / `receipt_tax_invoice` (ใบเสร็จรับเงิน/ใบกำกับภาษี ตอนรับเงิน) */
  docKind: TaxInvoiceDocKind
  /** ชื่อเอกสารที่พิมพ์บนหัวใบ */
  docTitle: string
  /** เงินรับต้นเหตุ (ใบเสร็จรับเงิน/ใบกำกับภาษี) */
  cashReceiptId: string | null
  /** ยอดบนใบ (snapshot) */
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** อัตรา VAT ที่ใช้บนใบ (ข้อความ NUMERIC) — ใบเดิมหลายอัตรา = `null` */
  vatRatePctUsed: string | null
  /** U96 #8 — เลขที่ของใบที่ใบนี้ออกแทน */
  replacesInvoiceNumber: string | null
  invoiceNumber: string
  invoiceDate: string
  status: TaxInvoiceStatus
  statusLabel: string
  cancelReason: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  createdAt: string
  /**
   * งวดของวันที่ออกใบส่งบัญชี/ล็อกแล้ว ⇒ ยกเลิกตรงไม่ได้ ต้องผ่าน Adjustment (UAT BUG-169)
   * — หน้าจอปิดปุ่ม "ยกเลิก" ตามค่านี้ · API ตรวจซ้ำด้วยยามงวดเสมอ
   */
  periodClosed: boolean
}

export interface SalesRecordDto {
  id: string
  periodId: string
  periodLabel: string
  companyId: string
  companyName: string
  billingBatchId: string
  billingPeriod: string
  /** เลขรอบวางบิล `BL-<พ.ศ.>-NNN` (มติ U76) */
  billingBatchNumber: string
  billingStatus: BillingBatchStatus
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  createdAt: string
  /** ใบกำกับภาษี/ใบเสร็จรับเงินฯ ที่ใช้งานอยู่ใบล่าสุด (`null` = ยังไม่ออก) */
  activeTaxInvoice: TaxInvoiceSummaryDto | null
  /** ใบที่เคยออกทั้งหมดรวมใบที่ยกเลิก — เรียงใหม่ → เก่า (รับเงินบางส่วน ⇒ หลายใบ active ได้ — U95) */
  taxInvoices: TaxInvoiceSummaryDto[]
  /** ยอดก่อน VAT ที่ออกเอกสารภาษีแล้ว (ใบ active) — ส่วนที่เหลือยังไม่ถึงจุดความรับผิด VAT */
  invoicedBeforeVatSatang: number
}

export interface SalesListDto {
  items: SalesRecordDto[]
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** จำนวนรายการขายที่ยังไม่มีเอกสารภาษี (ยังไม่รับเงิน หรือรับแล้วยังไม่ออกใบ) */
  awaitingInvoiceCount: number
}

export interface TaxInvoiceDto extends TaxInvoiceSummaryDto {
  salesRecordId: string
  companyId: string
  /** ชื่อผู้ซื้อตาม snapshot บนใบ (U96 #4) */
  companyName: string
  periodLabel: string
  billingBatchNumber: string
  createdByName: string
}

export interface TaxInvoiceListDto {
  items: TaxInvoiceDto[]
}

/** แท็บ "เงินรับ" (`31` §8) — อ่านอย่างเดียว สร้างจากไฟล์ 35 เท่านั้น */
export interface CashReceiptDto {
  id: string
  receivedDate: string
  payerName: string
  amountSatang: number
  whtWithheldByCustomerSatang: number
  bankRef: string | null
  bankMatchStatus: BankMatchStatus | null
  billingBatchId: string
  billingPeriod: string
  /** เลขรอบวางบิล `BL-<พ.ศ.>-NNN` (มติ U76) */
  billingBatchNumber: string
  billingStatus: BillingBatchStatus
  /**
   * มติ PO U169 — ส่วนต่างที่รอบวางบิลตัดเป็นค่าธรรมเนียมธนาคาร (U144/U163) · `> 0` ⇒ ใบที่ปิดยอดออกเต็มยอดบิล
   */
  billingBankFeeWrittenOffSatang: number
  note: string | null
  createdAt: string
  /** U95 — ใบเสร็จรับเงิน/ใบกำกับภาษีที่ใช้งานอยู่ของเงินรับนี้ (`null` = ยังไม่ออก) */
  taxInvoice: TaxInvoiceSummaryDto | null
  /** ใบที่ยกเลิกแล้วของเงินรับนี้ (ใบใหม่จะพิมพ์ "ออกแทนฉบับเลขที่ …") */
  cancelledTaxInvoices: TaxInvoiceSummaryDto[]
  /** รอบนี้ออกใบกำกับภาษีแบบเดิม (ตอนวางบิล) ไว้แล้ว ⇒ ไม่ต้องออกใบเสร็จรับเงิน/ใบกำกับภาษีอีก */
  coveredByLegacyInvoice: boolean
}

export interface CashReceiptListDto {
  items: CashReceiptDto[]
  totalSatang: number
  totalWhtWithheldByCustomerSatang: number
  /** เงินรับที่ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี (U95 · ใช้เตือนก่อนปิดงวด) */
  awaitingTaxInvoiceCount: number
}
