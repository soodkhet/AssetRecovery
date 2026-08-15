import type { BillingBatchStatus, RevenueStatus, ServiceFeeModel, VatMode } from '@/lib/generated/prisma/enums'

/**
 * DTO ของรายได้/รอบวางบิล (ไฟล์ 19 §7–§8) — ใช้ร่วม FE/BE
 * เงินทุกช่องเป็น **satang** (Rule 01) · วันที่คอลัมน์ `DATE` ส่งเป็น `YYYY-MM-DD`, instant เป็น ISO UTC
 */

export interface RevenueDto {
  id: string
  caseId: string
  caseRef: string
  debtorName: string | null
  companyId: string
  companyName: string
  /** รอบติดตามที่ทำให้เกิดรายได้ใบนี้ (B3 — กันบิลซ้ำข้ามรอบ recycle) */
  trackingRound: number
  /** `YYYY-MM-DD` — วันปิดงานของเคสตามปฏิทินไทย */
  revenueDate: string
  feeModelSnapshot: ServiceFeeModel
  grossSatang: number
  vatSatang: number
  /** snapshot อัตราที่ใช้จริง — 0 เมื่อบริษัท `no_vat` */
  vatRatePctUsed: number
  totalSatang: number
  status: RevenueStatus
  billingBatchId: string | null
  /** ชื่อรอบที่ถูกรวมเข้า — `null` = ยังไม่ถูกรวม (แสดง "-" ตาม `19` §8) */
  billingBatchPeriod: string | null
  createdAt: string
}

export interface BillingBatchDto {
  id: string
  companyId: string
  companyName: string
  companyVatMode: VatMode
  /** เช่น "มิถุนายน 2569" (พ.ศ.) */
  period: string
  status: BillingBatchStatus
  totalSatang: number
  receivedSatang: number
  /** A1 — WHT ที่บริษัทไฟแนนซ์หักจากเรา (นับเป็นรับชำระแล้ว ไม่ใช่หนี้ค้าง) */
  whtWithheldByCustomerSatang: number
  /** `22` §6.11 — `total − received` (ติดลบได้เมื่อรับเกิน) */
  outstandingSatang: number
  /** `YYYY-MM-DD` */
  dueDate: string
  /** จำนวนวันเลยกำหนดชำระ ณ วันที่ดูรายการ (ลบ = ยังไม่ถึงกำหนด) */
  daysOverdue: number
  sentAt: string | null
  revenueCount: number
  createdAt: string
  createdByName: string
}

export interface BillingBatchDetailDto extends BillingBatchDto {
  revenues: RevenueDto[]
}

export interface ArAgingBucketDto {
  label: string
  outstandingSatang: number
  batchCount: number
}

export interface ArAgingCompanyDto {
  companyId: string
  companyName: string
  buckets: ArAgingBucketDto[]
  outstandingSatang: number
}

export interface ArAgingReportDto {
  /** `YYYY-MM-DD` — วันที่ใช้นับอายุหนี้ (ค่าเริ่มต้น = วันนี้ตามเวลาไทย) */
  asOf: string
  /** ช่วงอายุหนี้จาก `finance_policy_settings.ar_aging_buckets` (`13` §6.2.1) */
  buckets: ArAgingBucketDto[]
  companies: ArAgingCompanyDto[]
  totalOutstandingSatang: number
}
