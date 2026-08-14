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
  grossSatang: number
  whtSatang: number
  netSatang: number
  whtPctUsed: number
  /** `payee` = ใช้ Tax Profile ของผู้รับเงิน · `plan` = fallback ชั่วคราว ต้องโชว์ `whtWarning` */
  whtRateSource: 'payee' | 'plan'
  whtWarning: string | null
  status: ExpenseStatus
  approvalStepCurrent: number
  approvalStepTotal: number
  /** role ที่ขั้นปัจจุบันรออยู่ — `null` = ตั้งค่าสายอนุมัติไม่ครอบยอดนี้ (`APPROVAL_MATRIX_NOT_FOUND`) */
  pendingStepRole: string | null
  approvalHistory: readonly ApprovalHistoryEntry[]
  rejectReason: string | null
  createdAt: string
}

export const compensationListQuerySchema = z.object({
  status: z
    .enum(['pending_approval', 'pending_finance_approval', 'needs_revision', 'approved', 'all'])
    .default('all'),
  caseId: z.string().uuid().optional(),
  payeeId: z.string().uuid().optional(),
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
