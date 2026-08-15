import type { BankMatchStatus, BillingBatchStatus, TaxInvoiceStatus } from '@/lib/generated/prisma/enums'

/**
 * DTO ของบัญชีขายและเงินรับ (ไฟล์ 31 §8) — เงินเป็น satang เสมอ, วันที่เป็น ISO UTC
 * (ฝั่งจอแปลงเป็น พ.ศ. ด้วย `fmtDate` — Rule 01)
 */

/** ใบกำกับภาษีแบบย่อ ติดไปกับแถวรายการขาย */
export interface TaxInvoiceSummaryDto {
  id: string
  invoiceNumber: string
  invoiceDate: string
  status: TaxInvoiceStatus
  statusLabel: string
  cancelReason: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  createdAt: string
}

export interface SalesRecordDto {
  id: string
  periodId: string
  periodLabel: string
  companyId: string
  companyName: string
  billingBatchId: string
  billingPeriod: string
  billingStatus: BillingBatchStatus
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  createdAt: string
  /** ใบกำกับภาษีที่ใช้งานอยู่ (`31` §7.1 — `null` = ยังไม่ออก) */
  activeTaxInvoice: TaxInvoiceSummaryDto | null
  /** ใบที่เคยออกทั้งหมดรวมใบที่ยกเลิก — เรียงใหม่ → เก่า */
  taxInvoices: TaxInvoiceSummaryDto[]
}

export interface SalesListDto {
  items: SalesRecordDto[]
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** จำนวนรายการขายที่ยังไม่ออกใบกำกับภาษี — ใช้เตือนก่อนปิดงวด (`30` §6.2) */
  awaitingInvoiceCount: number
}

export interface TaxInvoiceDto extends TaxInvoiceSummaryDto {
  salesRecordId: string
  companyId: string
  companyName: string
  periodLabel: string
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
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
  billingStatus: BillingBatchStatus
  note: string | null
  createdAt: string
}

export interface CashReceiptListDto {
  items: CashReceiptDto[]
  totalSatang: number
  totalWhtWithheldByCustomerSatang: number
}
