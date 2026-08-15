import type {
  WhtCertificateStatus,
  WhtDeliveryFormat,
  WhtFilingForm,
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
  payoutBatchId: string
  payoutBatchName: string
  periodId: string
  periodLabel: string
  createdAt: string
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
  filingDueDate: string
  pnd3Satang: number
  pnd53Satang: number
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
