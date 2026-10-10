import type { CreditNoteStatus, CreditNoteType } from '@/lib/generated/prisma/enums'

/** DTO ของใบลดหนี้/ใบเพิ่มหนี้ (มติ PO U14/U19) — เงินเป็น satang · วันที่เป็น ISO UTC (หน้าจอแปลง พ.ศ. เอง) */
export interface CreditNoteDto {
  id: string
  /** `credit` = ใบลดหนี้ · `debit` = ใบเพิ่มหนี้ */
  noteType: CreditNoteType
  noteTypeLabel: string
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
  vatRatePctUsed: string
  /** snapshot สาขาผู้ซื้อตามใบกำกับเดิม (มติ PO U82) — `00000` = สำนักงานใหญ่ */
  buyerBranchCode: string
  /** "สำนักงานใหญ่" / "สาขาที่ 00001" */
  buyerBranchLabel: string
  reason: string
  filePath: string | null
  status: CreditNoteStatus
  statusLabel: string
  cancelReason: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  createdAt: string
  createdByName: string
  /** งวดของวันที่ออกส่งบัญชี/ล็อกแล้ว ⇒ ยกเลิกตรงไม่ได้ ต้องผ่าน Adjustment (UAT BUG-169) */
  periodClosed: boolean
}

/** ผลการบันทึก — `warnings` = เรื่องที่ต้องบอกแต่ไม่บล็อก (มติ PO U21: ยอดไม่ตรง Adjustment ที่อ้างถึง) */
export interface CreditNoteCreateResultDto extends CreditNoteDto {
  warnings: string[]
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

/** ใบลดหนี้/ใบเพิ่มหนี้ active แบบย่อของรอบวางบิล (ให้ portal) */
export interface CreditNoteSummary {
  id: string
  noteType: CreditNoteType
  taxInvoiceId: string
  invoiceNumber: string
  creditNoteNumber: string
  issueDate: string
  amountBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
  /** snapshot สาขาผู้ซื้อตามใบกำกับเดิม (มติ PO U82) */
  buyerBranchCode: string
}

/** Adjustment ที่อนุมัติแล้วแต่ยังไม่มีเอกสาร — ป้าย "รอใบลดหนี้" (ลดยอด) / "รอใบเพิ่มหนี้" (เพิ่มยอด — U19) */
export interface AwaitingCreditNoteDto {
  adjustmentId: string
  /** ชนิดเอกสารที่รอ — ลดยอด ⇒ `credit` · เพิ่มยอด ⇒ `debit` */
  noteType: CreditNoteType
  /** ป้ายบนจอ ("รอใบลดหนี้" / "รอใบเพิ่มหนี้") */
  label: string
  taxInvoiceId: string
  invoiceNumber: string
  billingBatchId: string
  amountSatang: number
  /** staging E-016 — ยอดค้างตามเอกสารของรอบวางบิล (0 = ชำระครบ ออกใบลดหนี้ในระบบไม่ได้) */
  billOutstandingSatang: number
  /** staging E-016 — ปิดป้ายเป็น "จัดการนอกระบบ" ได้ (ลดยอด + บิลชำระครบ) */
  canWaive: boolean
}
