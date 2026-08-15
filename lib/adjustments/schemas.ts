import { z } from 'zod'
import { ADJUSTMENT_TARGET_TYPES } from '@/lib/adjustments/adjustment'
import { satangSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของรายการปรับปรุง (ไฟล์ 20 · Rule 13)
 *
 * ⚠️ `reason`/`rejectionReason` ที่นี่ตรวจแค่ "เป็นสตริง" — ความยาวขั้นต่ำถูกบังคับด้วย
 *    `assertAdjustmentReason()`/`assertRejectionReason()` (pure) เพื่อให้ผู้ใช้ได้ code
 *    `REASON_REQUIRED`/`REJECTION_REASON_REQUIRED` ตรงตาม `20` §11 ไม่ใช่ field error ทั่วไป
 * ⚠️ `amountSatang` เป็น **ค่าบวกเสมอ** (`20` §7.1) — ทิศทางอยู่ที่ `adjustmentType`
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const adjustmentTargetTypeSchema = z.enum(ADJUSTMENT_TARGET_TYPES)

export const adjustmentListQuerySchema = z.object({
  status: z.enum(['all', 'pending_approval', 'approved', 'rejected']).default('all'),
  targetType: adjustmentTargetTypeSchema.optional(),
})

export const adjustmentTargetQuerySchema = z.object({
  targetType: adjustmentTargetTypeSchema,
  /** ค้นจากเลขที่อ้างอิง (`20` §8) — ว่าง = รายการล่าสุด */
  q: z.string().trim().max(100).default(''),
})

export const adjustmentCreateSchema = z.object({
  targetType: adjustmentTargetTypeSchema,
  targetId: uuidSchema,
  adjustmentType: z.enum(['increase', 'decrease']),
  amountSatang: satangSchema('ยอดที่ปรับ').refine((value) => value > 0, 'ยอดที่ปรับต้องมากกว่า 0'),
  reason: z.string().max(1000),
})

/** อนุมัติ (`20` §14) — หมายเหตุเพิ่มเติมของผู้อนุมัติ (ไม่บังคับ · เหตุผลหลักอยู่บนตัวรายการแล้ว) */
export const adjustmentApproveSchema = z.object({
  note: z.string().trim().max(1000).default(''),
})

/** ปฏิเสธ (`20` §14 v2.1) — terminal ⇒ `rejection_reason` บังคับ */
export const adjustmentRejectSchema = z.object({
  rejectionReason: z.string().max(1000),
})

export type AdjustmentListQuery = z.infer<typeof adjustmentListQuerySchema>
export type AdjustmentTargetQuery = z.infer<typeof adjustmentTargetQuerySchema>
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>
export type AdjustmentApproveInput = z.infer<typeof adjustmentApproveSchema>
export type AdjustmentRejectInput = z.infer<typeof adjustmentRejectSchema>
