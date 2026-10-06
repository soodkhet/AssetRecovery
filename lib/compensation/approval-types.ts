import type { SubstituteReceiptRefDto } from '@/lib/substitute-receipts/types'
import { z } from 'zod'
import { reasonSchema } from '@/lib/api/validation'
import type { ApprovalHistoryEntry } from '@/lib/compensation/approval'
import type { ExpenseStatus, ExpenseType } from '@/lib/generated/prisma/enums'

/**
 * DTO + Zod ของสายอนุมัติค่าตอบแทน (ไฟล์ 16 §8/§14) — schema ชุดเดียวใช้ร่วม FE/BE (Rule 13)
 *
 * ⚠️ ยอด `wht`/`net` ที่นี่คือ **ตัวเลขสำหรับแสดงผล** ที่คำนวณสด ๆ จากอัตราปัจจุบันของ payee
 * (`22` §6.9 · `18` §6.3) — ยอดที่ **ผูกพันการจ่ายจริง** ถูก snapshot ตอนสร้าง `payout_batch_items`
 * ที่ Phase 3.4 (`92` §7.1) ห้ามเอาค่าจากที่นี่ไปเขียนลงตารางการเงิน
 */

export interface CompensationApprovalDto {
  id: string
  caseId: string | null
  caseRef: string | null
  debtorName: string | null
  agentName: string | null
  payeeId: string
  payeeName: string
  /** payee ที่ยัง unverified รวมเข้ารอบจ่ายไม่ได้ (`18` §6.2) — เตือนตั้งแต่หน้าอนุมัติ */
  payeeVerified: boolean
  expenseType: ExpenseType
  /** `YYYY-MM-DD` (คอลัมน์ `DATE`) — display แปลงเป็น พ.ศ. ที่ layer บนสุด (Rule 01) */
  expenseDate: string
  distanceKm: string | null
  calculationSource: string | null
  /**
   * ข้อความ "สูตร / ฐานคิด" ที่ตารางแสดง (`16` §8 — เช่น "128.50 กม. × 3.50 บาท/กม.")
   * ประกอบฝั่ง server จาก **snapshot ของรายการ** เท่านั้น (`92` §7.1) หน้าจอห้ามคิดสูตรเอง
   */
  basisText: string
  /** ค่าที่พัก: ใบเสร็จออกในนามบริษัทหรือไม่ (มติ PO U96 #14) — รายการชนิดอื่น = `null` */
  receiptInCompanyName: boolean | null
  /** มติ PO U103 — ใบรับรองแทนใบเสร็จของรายการ (ป้ายบนคิวอนุมัติ) · ไม่มี = `null` */
  substituteReceipt: SubstituteReceiptRefDto | null
  grossSatang: number
  whtSatang: number
  netSatang: number
  whtPctUsed: number
  /** `payee` = ใช้ Tax Profile ของผู้รับเงิน · `plan` = fallback ชั่วคราว ต้องโชว์ `whtWarning` */
  whtRateSource: 'payee' | 'plan'
  whtWarning: string | null
  /** BUG-176 — เงื่อนไข (2)/(3) บริษัทออกภาษีให้ ⇒ `whtSatang` = ภาษีที่ออกให้ (ไม่หักจากผู้รับ) · `net = gross` */
  whtPayerBorne: boolean
  /** BUG-176 — true = ยอด WHT/Net มาจากรายการรอบจ่ายที่บันทึกแล้ว (ยอดโอนจริง) · false = คาดการณ์ */
  whtFromPayout: boolean
  status: ExpenseStatus
  approvalStepCurrent: number
  approvalStepTotal: number
  /** role ที่ขั้นปัจจุบันรออยู่ — `null` = ตั้งค่าสายอนุมัติไม่ครอบยอดนี้ (`APPROVAL_MATRIX_NOT_FOUND`) */
  pendingStepRole: string | null
  approvalHistory: readonly ApprovalHistoryEntry[]
  /**
   * ผู้เรียกถือ capability ระดับ `manage` ของ **ขั้นที่รายการรออยู่** ไหม (UAT R6-7) — หน้าจอใช้ซ่อนปุ่ม
   * อนุมัติ/ตีกลับรายแถว แทนการโชว์ปุ่มที่กดแล้วได้ 403 · UX เท่านั้น API ตรวจซ้ำเสมอ (DEC-002)
   */
  viewerCanAct: boolean
  rejectReason: string | null
  createdAt: string
}

export const compensationListQuerySchema = z.object({
  status: z
    .enum(['pending_approval', 'pending_finance_approval', 'needs_revision', 'approved', 'all'])
    .default('all'),
  caseId: z.string().guid().optional(),
  payeeId: z.string().guid().optional(),
})

export const compensationApproveSchema = z.object({
  /** ขั้นที่หน้าจอเห็นตอนกด — ป้องกันกดจากหน้าที่ค้าง (`16` §11) */
  step: z.number().int().min(1).max(5).optional(),
  note: z.string().trim().max(500).optional(),
})

/** `24` §6.4 `REJECT_REASON_REQUIRED` — ตีกลับต้องมีเหตุผลเสมอ (Rule 04) */
export const compensationRejectSchema = z.object({
  reason: reasonSchema,
})

export type CompensationApprovalListQuery = z.infer<typeof compensationListQuerySchema>
export type CompensationApproveInput = z.infer<typeof compensationApproveSchema>
export type CompensationRejectInput = z.infer<typeof compensationRejectSchema>
