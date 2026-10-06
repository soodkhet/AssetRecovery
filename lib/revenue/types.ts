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
  /** snapshot `vat_mode` ของบริษัทตอนสร้างรายได้ (มติ PO 03/10/2569 — UAT Q6) — ป้าย VAT อ่านจากตัวนี้ */
  vatModeSnapshot: VatMode
  grossSatang: number
  vatSatang: number
  /** snapshot อัตราที่ใช้จริง — 0 เมื่อบริษัท `no_vat` */
  vatRatePctUsed: number
  totalSatang: number
  status: RevenueStatus
  billingBatchId: string | null
  /** ชื่อรอบที่ถูกรวมเข้า — `null` = ยังไม่ถูกรวม (แสดง "-" ตาม `19` §8) */
  billingBatchPeriod: string | null
  /** เลขรอบวางบิล `BL-<พ.ศ.>-NNN` (มติ U76) — `null` = ยังไม่ถูกรวม */
  billingBatchNumber: string | null
  createdAt: string
}

export interface BillingBatchDto {
  id: string
  companyId: string
  companyName: string
  /** โหมด VAT ที่ snapshot ไว้กับรายได้ในรอบ (UAT Q6) — ปกติมีค่าเดียว · หลายค่า = บริษัทเปลี่ยนโหมดระหว่างงวด */
  vatModes: VatMode[]
  /** เลขรอบวางบิล `BL-<พ.ศ.>-NNN` ต่อองค์กร รีเซ็ตทุกปี พ.ศ. (มติ U76) */
  batchNumber: string
  /** เช่น "มิถุนายน 2569" (พ.ศ.) */
  period: string
  status: BillingBatchStatus
  totalSatang: number
  receivedSatang: number
  /** A1 — WHT ที่บริษัทไฟแนนซ์หักจากเรา (นับเป็นรับชำระแล้ว ไม่ใช่หนี้ค้าง) */
  whtWithheldByCustomerSatang: number
  /** `22` §6.11 — `total − received` (ติดลบได้เมื่อรับเกิน) */
  outstandingSatang: number
  /** ยอดรายได้ในรอบ **ก่อน VAT** (ผลรวม `revenues.gross_satang`) */
  amountBeforeVatSatang: number
  /** อัตราที่บริษัทหักภาษี ณ ที่จ่ายจากเรา (ค่าปัจจุบันของบริษัท) — `null` = ไม่หัก */
  customerWhtPct: number | null
  /**
   * UAT BUG-165 — ภาษีที่ลูกค้าจะหัก ณ ที่จ่าย: ยังไม่รับเงิน = **ประมาณ** จากอัตราของบริษัท (`customerWhtIsEstimate`)
   * · บันทึกยอดหักจริงแล้ว = ยอดจริง · ไม่บันทึกลง DB
   */
  customerWhtSatang: number
  customerWhtIsEstimate: boolean
  /** ยอดที่คาดว่าจะได้รับ = ยอดเรียกเก็บรวม VAT − ภาษีที่ลูกค้าหัก */
  expectedReceiptSatang: number
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
  /**
   * U96 #11 — Adjustment ที่อนุมัติแล้วแต่ยังไม่มีใบลดหนี้/ใบเพิ่มหนี้ (ยอดค้างตามเอกสารยังไม่สะท้อน)
   * ⇒ หน้าจอแสดงป้าย "รอใบลดหนี้/ใบเพิ่มหนี้"
   */
  awaitingNoteAdjustmentCount: number
}

export interface ArAgingReportDto {
  /** `YYYY-MM-DD` — วันที่ใช้นับอายุหนี้ (ค่าเริ่มต้น = วันนี้ตามเวลาไทย) */
  asOf: string
  /** ช่วงอายุหนี้จาก `finance_policy_settings.ar_aging_buckets` (`13` §6.2.1) */
  buckets: ArAgingBucketDto[]
  companies: ArAgingCompanyDto[]
  totalOutstandingSatang: number
}
