import type { AdjustmentTargetType } from '@/lib/adjustments/adjustment'
import type { AccountingPeriodStatus, AdjustmentStatus, AdjustmentType } from '@/lib/generated/prisma/enums'

/**
 * DTO ของรายการปรับปรุง (ไฟล์ 20 §7–§8) — ใช้ร่วม FE/BE
 * เงินทุกช่องเป็น **satang** (Rule 01) · instant เป็น ISO UTC (หน้าจอแปลง พ.ศ. เอง)
 */

export interface AdjustmentDto {
  id: string
  targetType: AdjustmentTargetType
  targetId: string
  /** เลขที่/รหัสอ้างอิงของรายการต้นทางที่ผู้ใช้ค้นหาได้ (เช่น `CASE-26-0012`) */
  targetRef: string
  /** ข้อความสั้นอธิบายรายการต้นทาง (บริษัท/งวด/ผู้รับเงิน) */
  targetLabel: string
  adjustmentType: AdjustmentType
  /** ค่าบวกเสมอ — ทิศทางอยู่ที่ `adjustmentType` (`20` §7.1) */
  amountSatang: number
  /** `+amount` / `−amount` — ยอดที่มีผลจริงต่อรายการต้นทางเมื่ออนุมัติแล้ว */
  signedSatang: number
  reason: string
  status: AdjustmentStatus
  /** snapshot ณ ตอนสร้าง (`null` = ยังไม่มีงวดบัญชีของเดือนนั้น ⇒ ถือเป็น `collecting`) */
  periodStatusAtTarget: AccountingPeriodStatus | null
  /** ข้อความอธิบายระดับอนุมัติที่ต้องใช้ (`20` §6.2) */
  approvalPolicyLabel: string
  /** บทบาทที่ต้องอนุมัติครบทุกตัว */
  requiredApproverRoles: readonly string[]
  /** บทบาทที่อนุมัติไปแล้ว (อ่านจาก audit log — append-only) */
  approvedRoles: readonly string[]
  /** บทบาทที่ยังขาดก่อนอนุมัติสมบูรณ์ */
  missingApproverRoles: readonly string[]
  rejectionReason: string | null
  approvedByName: string | null
  approvedAt: string | null
  createdAt: string
  createdByName: string
}

/** ตัวเลือกรายการต้นทางในฟอร์มสร้าง Adjustment (`20` §8 — ค้นหาจากเลขที่อ้างอิง) */
export interface AdjustmentTargetDto {
  targetType: AdjustmentTargetType
  targetId: string
  targetRef: string
  targetLabel: string
  /** ยอดปัจจุบันของรายการต้นทาง (สตางค์) — ใช้แสดงประกอบการตัดสินใจเท่านั้น */
  currentSatang: number
  /** `YYYY-MM-DD` — วันที่ที่ใช้หางวดบัญชีของรายการนี้ */
  targetDate: string
  periodStatusAtTarget: AccountingPeriodStatus | null
  approvalPolicyLabel: string
  requiredApproverRoles: readonly string[]
  /**
   * แก้ยอดตรงไม่ได้แล้ว ⇒ **ต้อง**ใช้ Adjustment (`19` §10 `EDIT_BILLED_REVENUE` /
   * `13` §6.11 รอบ `locked`) — `false` = ยังแก้ต้นทางตรงได้ แต่สร้าง Adjustment ก็ยังทำได้
   */
  directEditBlocked: boolean
}
