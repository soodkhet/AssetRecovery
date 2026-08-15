import { z } from 'zod'
import { dateOnlySchema, reasonSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของรายได้/รอบวางบิล (ไฟล์ 19 · Rule 13)
 *
 * ที่นี่ตรวจแค่ **รูปร่างของ input** — กติกาธุรกิจ (สถานะ/ยอด/วันครบกำหนด) อยู่ที่
 * `lib/revenue/revenue.ts` + `lib/settings/cycles.ts` และยอดเงินคิดที่ `lib/finance/*` เท่านั้น
 *
 * ⚠️ `cutoffDate` เทียบกับคอลัมน์ `DATE` (`revenues.revenue_date`) ⇒ ใช้ `dateOnlySchema()`
 *    (เที่ยงคืน **UTC**) เหมือน 3.3/3.4 — ห้ามใช้ `fromInputDate()` (ดูกับดักใน REUSE_INDEX)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const revenueListQuerySchema = z.object({
  companyId: uuidSchema.optional(),
  status: z.enum(['all', 'ready_for_billing', 'billed']).default('all'),
  /** ช่วง `revenue_date` (คอลัมน์ `DATE`) — ปลายช่วงนับรวมทั้งวัน */
  dateFrom: dateOnlySchema('วันที่เริ่ม').optional(),
  dateTo: dateOnlySchema('วันที่สิ้นสุด').optional(),
  /** ยังไม่ถูกรวมเข้ารอบวางบิล — ใช้ในตารางรายการรายได้ดิบของ `19` §8 */
  unbilledOnly: z
    .preprocess((value) => (value === 'true' ? true : value === 'false' ? false : value), z.boolean())
    .default(false),
})

export const billingBatchListQuerySchema = z.object({
  companyId: uuidSchema.optional(),
  status: z.enum(['all', 'draft', 'sent', 'partially_paid', 'paid']).default('all'),
})

/**
 * สร้างรอบวางบิล (`19` §9.1) — รวม Revenue ที่ `ready_for_billing` ของบริษัทนั้น
 * ตั้งแต่ต้นเดือนของวันตัดรอบจนถึงวันตัดรอบ
 *
 * `cycleId` = รอบบิล (`13` §6.1 ชนิด `AR`) ที่ใช้คำนวณวันครบกำหนด — ไม่ระบุจะใช้
 * `finance_companies.payment_due_days` ของบริษัทนั้นเป็น Net N วันแทน (`02` §5)
 */
export const billingBatchCreateSchema = z.object({
  companyId: uuidSchema,
  cutoffDate: dateOnlySchema('วันตัดรอบ'),
  cycleId: uuidSchema.nullable().default(null),
  reason: reasonSchema,
})

/** ส่งบิลจริง (`19` §9.1 `draft → sent`) — กระทบเงิน ⇒ `reason` บังคับ (`90` §13) */
export const billingBatchSendSchema = z.object({
  reason: reasonSchema,
})

/** ลบรอบที่ยัง `draft` (`19` §10) — ปล่อย Revenue กลับเป็น `ready_for_billing` */
export const billingBatchDeleteSchema = z.object({
  reason: reasonSchema,
})

export const arAgingQuerySchema = z.object({
  companyId: uuidSchema.optional(),
  /** วันที่ใช้นับอายุหนี้ — ไม่ระบุ = วันนี้ */
  asOf: dateOnlySchema('วันที่ดูรายงาน').optional(),
})

export type RevenueListQuery = z.infer<typeof revenueListQuerySchema>
export type BillingBatchListQuery = z.infer<typeof billingBatchListQuerySchema>
export type BillingBatchCreateInput = z.infer<typeof billingBatchCreateSchema>
export type BillingBatchSendInput = z.infer<typeof billingBatchSendSchema>
export type BillingBatchDeleteInput = z.infer<typeof billingBatchDeleteSchema>
export type ArAgingQuery = z.infer<typeof arAgingQuerySchema>
