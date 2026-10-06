import type {
  WhtCertificateStatus,
  WhtDeliveryFormat,
  WhtFilingForm,
  WhtFilingMethod,
  WhtFilingStatus,
} from '@/lib/generated/prisma/enums'
import type { FilingTotals, FilingWarning } from '@/lib/wht/wht'

/**
 * DTO ของหนังสือรับรองหัก ณ ที่จ่าย + สรุปรอบนำส่ง (ไฟล์ 33 §8)
 * — เงินเป็น satang เสมอ, วันที่เป็น ISO UTC (จอแปลงเป็น พ.ศ. ด้วย `fmtDate` — Rule 01)
 */

export interface WhtCertificateDto {
  id: string
  certificateNumber: string
  payeeId: string
  payeeName: string
  /** เลขประจำตัวผู้เสียภาษี/บัตรประชาชนของผู้ถูกหัก — `null` = ยังไม่กรอกในโปรไฟล์ผู้รับเงิน */
  payeeTaxId: string | null
  incomeType: string
  paymentDate: string
  grossSatang: number
  whtSatang: number
  filingForm: WhtFilingForm
  filingFormLabel: string
  deliveryFormat: WhtDeliveryFormat
  deliveryFormatLabel: string
  status: WhtCertificateStatus
  statusLabel: string
  cancelReason: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  /** ฉบับที่ใบนี้ออกแทน (trace ย้อนกลับได้ 2 ทาง — `33` §7.1) */
  replacesCertificateId: string | null
  replacesCertificateNumber: string | null
  /** รายการค่าใช้จ่ายต้นทาง (ไฟล์ 32) + รอบจ่ายเงิน (ไฟล์ 17) */
  expenseRecordId: string
  /** ต่อผู้รับต่อรอบ / ต่อรายการ (มติ PO 05/10/2569 UAT U4) */
  issueMode: 'per_payee_batch' | 'per_item'
  payoutBatchId: string
  payoutBatchName: string
  periodId: string
  periodLabel: string
  createdAt: string
  /** งวดของวันที่จ่ายส่งบัญชี/ล็อกแล้ว ⇒ ยกเลิกตรงไม่ได้ ต้องผ่าน Adjustment (UAT BUG-169) */
  periodClosed: boolean
}

export interface WhtCertificateListDto {
  items: WhtCertificateDto[]
  /** ยอดรวมตามตัวกรอง — ใบที่ยกเลิกไม่ถูกนับใน pnd3/pnd53 (`33` §9) */
  summary: FilingTotals
}

export interface WhtFilingSummaryDto {
  id: string
  periodId: string
  periodLabel: string
  /** วันกำหนดยื่นจริง (เลื่อนวันหยุดแล้ว — U93) */
  filingDueDate: string
  /** วันตามปฏิทินก่อนเลื่อน — `null` = ไม่ได้ถูกเลื่อน (มติ PO U93) */
  filingNominalDueDate: string | null
  /** ป้ายพร้อมแสดง: "15/11/2569 → 16/11/2569 (เลื่อนจากวันหยุด) (ยื่นออนไลน์)" หรือ "07/07/2569 (ยื่นแบบกระดาษ)" */
  filingDueLabel: string
  /** เฉพาะส่วนวันที่ของป้าย (ไม่มีวิธียื่น) — ใช้ในตาราง */
  filingDueDateText: string
  /** วิธียื่นที่ใช้คิดวันกำหนดยื่น (มติ PO U45) */
  filingMethod: WhtFilingMethod
  /** "(ยื่นออนไลน์)" / "(ยื่นแบบกระดาษ)" — ต่อท้ายวันกำหนดยื่นบนจอ */
  filingMethodLabel: string
  pnd3Satang: number
  pnd53Satang: number
  /** ภ.ง.ด.1 — เงินได้ 40(2) */
  pnd1Satang: number
  status: WhtFilingStatus
  statusLabel: string
  filedAt: string | null
  filedByName: string | null
  /** วันคงเหลือก่อนถึงกำหนด (ติดลบ = เลยกำหนด) — สำหรับ banner countdown (`33` §8) */
  daysRemaining: number
  isOverdue: boolean
}

export interface WhtFilingSummaryListDto {
  items: WhtFilingSummaryDto[]
  /** รอบที่ยังไม่ยื่นและใกล้ที่สุด — ตัวที่ banner ด้านบนหน้าจอใช้ (`33` §8) */
  pending: WhtFilingSummaryDto | null
  /** `FILING_OVERDUE_WARNING` — เตือน **ไม่ block** (`33` §11) */
  warning: FilingWarning | null
}
