import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของรอบจ่ายเงิน (ไฟล์ 17 · Rule 13)
 *
 * ที่นี่ตรวจแค่ **รูปร่างของ input** — กติกาธุรกิจ (สถานะ/ฝั่ง/payee ยืนยันแล้ว) อยู่ที่
 * `lib/payout/payout.ts` และยอดเงินคิดที่ `lib/finance/*` (3.1) เท่านั้น
 *
 * ⚠️ `cutoffDate` เทียบกับคอลัมน์ `DATE` (`expenses.expense_date`) ⇒ ใช้ `dateOnlySchema()`
 *    (เที่ยงคืน **UTC**) เหมือน 3.3 — ห้ามใช้ `fromInputDate()` (ดูกับดักใน REUSE_INDEX)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

/** เหตุผลบังคับของ action ที่ทำให้เงินออก/ปิดรอบ (`90` §13 — เงิน+ธนาคาร) */
const reasonSchema = z
  .string()
  .trim()
  .min(5, 'ระบุเหตุผลอย่างน้อย 5 ตัวอักษร')
  .max(500, 'เหตุผลยาวเกินไป')

export const payoutBatchCreateSchema = z.object({
  /** `17` §6.1 — 1 รอบ = 1 ฝั่งเสมอ */
  side: z.enum(['inhouse', 'outsource']),
  /** วันสิ้นสุดตัดรอบ — ดึงรายการที่อนุมัติแล้วจนถึงวันนี้ (`17` §7.1) */
  cutoffDate: dateOnlySchema('วันตัดรอบ'),
  /** เว้นว่าง = ระบบตั้งชื่อให้จากฝั่ง + วันตัดรอบ */
  name: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(200, 'ชื่อรอบจ่ายยาวเกินไป').nullable().default(null),
  ),
})

/**
 * สร้างไฟล์โอนเงิน (`17` §8 modal) — เลือก **รูปแบบไฟล์ธนาคาร** + **บัญชีที่จ่าย**
 * `confirmDuplicate` = ผู้ใช้ยืนยันหลังเห็นคำเตือน `DUPLICATE_PAYMENT_FILE` แล้ว (`17` §6.3)
 */
export const paymentFileGenerateSchema = z.object({
  bankAccountId: uuidSchema,
  bankFileFormatId: uuidSchema,
  confirmDuplicate: z.boolean().default(false),
  reason: reasonSchema,
})

/** ยืนยันจ่ายสำเร็จ (`17` §13 — ต้องระบุผู้ยืนยันชัดเจน ⇒ audit + reason บังคับ) */
export const payoutCompleteSchema = z.object({
  reason: reasonSchema,
})

export const payoutBatchListQuerySchema = z.object({
  status: z.enum(['all', 'draft', 'checking', 'file_generated', 'completed']).default('all'),
  side: z.enum(['all', 'inhouse', 'outsource']).default('all'),
})

export type PayoutBatchCreateInput = z.infer<typeof payoutBatchCreateSchema>
export type PaymentFileGenerateInput = z.infer<typeof paymentFileGenerateSchema>
export type PayoutCompleteInput = z.infer<typeof payoutCompleteSchema>
export type PayoutBatchListQuery = z.infer<typeof payoutBatchListQuerySchema>
