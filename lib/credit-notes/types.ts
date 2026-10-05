import type { CreditNoteStatus } from '@/lib/generated/prisma/enums'

/** DTO ของใบลดหนี้ (มติ PO U14) — เงินเป็น satang · วันที่เป็น ISO UTC (หน้าจอแปลง พ.ศ. เอง) */
export interface CreditNoteDto {
  id: string
  taxInvoiceId: string
  invoiceNumber: string
  companyId: string
  companyName: string
  adjustmentId: string | null
  creditNoteNumber: string
  issueDate: string
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** อัตรา VAT ของใบกำกับเดิม เช่น `"7"` */
  vatRateUsed: string
  reason: string
  filePath: string | null
  status: CreditNoteStatus
  statusLabel: string
  cancelReason: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  createdAt: string
  createdByName: string
}

export interface CreditNoteListDto {
  items: CreditNoteDto[]
}

/** ยอดรวมใบลดหนี้ active ของใบกำกับหนึ่งใบ (ให้ portal / หน้าใบกำกับ) */
export interface CreditNoteTotals {
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  count: number
}

/** ใบลดหนี้ active แบบย่อของรอบวางบิล (ให้ portal) */
export interface CreditNoteSummary {
  id: string
  taxInvoiceId: string
  invoiceNumber: string
  creditNoteNumber: string
  issueDate: string
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

/** Adjustment ที่อนุมัติแล้วแต่ยังไม่มีใบลดหนี้ — ป้าย "รอใบลดหนี้" */
export interface AwaitingCreditNoteDto {
  adjustmentId: string
  taxInvoiceId: string
  invoiceNumber: string
  billingBatchId: string
  amountSatang: number
}
