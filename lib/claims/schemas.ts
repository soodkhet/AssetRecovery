import { z } from 'zod'
import { dateOnlySchema, satangSchema } from '@/lib/api/validation'
import { MANUAL_CLAIM_TYPES } from '@/lib/claims/claim'
import type { ExpenseType } from '@/lib/generated/prisma/enums'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของ Manual Claim (`15` §7.1 · Rule 13)
 * ประเภทจำกัดอยู่ใน `expense_type` ของ `02` §3 เท่านั้น — ห้ามสร้าง enum ใหม่ (`15` §9 header)
 */

const manualClaimTypeSchema = z.enum(MANUAL_CLAIM_TYPES as [ExpenseType, ...ExpenseType[]], {
  message: 'ประเภทรายการเบิกไม่ถูกต้อง',
})

export const claimCreateSchema = z.object({
  claimType: manualClaimTypeSchema,
  grossSatang: satangSchema('ยอดเงิน').refine((value) => value > 0, 'ยอดเงินต้องมากกว่า 0'),
  expenseDate: dateOnlySchema('วันที่เกิดรายการ'),
  /** บันทึกแทนผู้อื่น — ใช้ได้เฉพาะผู้ถือสิทธิ์อนุมัติขั้นการเงิน (`25` §7.2) */
  payeeId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().uuid('รูปแบบรหัสไม่ถูกต้อง').nullable().default(null),
  ),
  receiptFileUrl: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(500, 'ลิงก์ใบเสร็จยาวเกินไป').nullable().default(null),
  ),
  /** คำอธิบายรายการ — `15` §7.1 ต้องการข้อความอิสระ เก็บที่ช่องหมายเหตุของ `expenses` */
  note: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(500, 'หมายเหตุยาวเกินไป').nullable().default(null),
  ),
})

export type ClaimCreateInput = z.infer<typeof claimCreateSchema>
