import { z } from 'zod'
import { isDueClearDateInPast } from '@/lib/advances/advance'
import { dateOnlySchema, satangSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของเงินทดรองจ่าย (ไฟล์ 15 · Rule 13)
 *
 * ที่นี่ตรวจแค่ **รูปร่างของ input** — กติกาธุรกิจ (ห้ามเบิกซ้อน / เพดาน / สถานะ) อยู่ที่
 * `lib/advances/advance.ts` และสูตรยอดคืนอยู่ที่ `lib/finance/advance-calc.ts` (3.1) ที่เดียว
 *
 * ⚠️ `dueClearDate` เป็นคอลัมน์ `DATE` ⇒ ใช้ `dateOnlySchema()` (เที่ยงคืน **UTC**)
 * ห้ามใช้ `fromInputDate()` ซึ่งให้เที่ยงคืนไทย = วันที่เพี้ยนไป 1 วัน (ดู REUSE_INDEX)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `${label}ยาวเกิน ${max} ตัวอักษร`).nullable().default(null),
  )

export const advanceCreateSchema = z.object({
  requestedSatang: satangSchema('ยอดที่ขอเบิก').refine((value) => value > 0, 'ยอดที่ขอเบิกต้องมากกว่า 0'),
  /** `15` §7.2 — บังคับกรอก (`REQUIRED_MISSING`) */
  purpose: z.string().trim().min(5, 'ระบุวัตถุประสงค์อย่างน้อย 5 ตัวอักษร').max(500, 'วัตถุประสงค์ยาวเกินไป'),
  /**
   * มติ PO 03/10/2569 (UAT Q8, BUG-058) — ห้ามวันที่ผ่านมาแล้วตามปฏิทินไทย (วันนี้ได้) · ตรวจทั้ง FE/BE
   * ด้วย schema เดียวนี้ · ผิด = 400 + field error (`REQUIRED_MISSING` ของ `fieldErrorResponse()` — ไม่ตั้ง code ใหม่)
   */
  dueClearDate: dateOnlySchema('กำหนดเคลียร์ยอด').refine(
    (date) => !isDueClearDateInPast(date, new Date()),
    'กำหนดเคลียร์ยอดต้องเป็นวันนี้หรือวันถัดไป — เลือกวันที่ผ่านมาแล้วไม่ได้',
  ),
  /**
   * ขอเบิกแทนผู้อื่น — ใช้ได้เฉพาะผู้ถือสิทธิ์อนุมัติ (การเงิน) เท่านั้น
   * ผู้ขอทั่วไปเว้นว่าง ระบบผูกกับ payee ของตัวเองเสมอ (`15` §12 — own scope)
   */
  payeeId: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    uuidSchema.nullable().default(null),
  ),
})

/** อนุมัติ — ปรับลดยอดได้ (`02` §5 แยก `approved_satang`) · เว้นว่าง = อนุมัติเต็มจำนวน */
export const advanceApproveSchema = z.object({
  approvedSatang: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    satangSchema('ยอดที่อนุมัติ').nullable().default(null),
  ),
  note: optionalText(500, 'หมายเหตุ'),
})

/** `24` §6.4 `REJECTION_REASON_REQUIRED` — ปฏิเสธต้องมีเหตุผลเสมอ */
export const advanceRejectSchema = z.object({
  rejectionReason: z.string().trim().min(5, 'ระบุเหตุผลอย่างน้อย 5 ตัวอักษร').max(500, 'เหตุผลยาวเกินไป'),
})

/** เคลียร์ยอด (`15` §9.1) — ยอดคืนคำนวณโดย DB (generated column) ห้ามส่งมาจากหน้าจอ */
export const advanceSettleSchema = z.object({
  usedSatang: satangSchema('ยอดที่ใช้จริง'),
  /** `15` §13 — ไฟล์ใบเสร็จอ้างอิงถูกบันทึกลง audit (ตาราง `advances` ไม่มีคอลัมน์เก็บ) */
  receiptFileUrl: optionalText(500, 'ลิงก์ใบเสร็จ'),
  note: optionalText(500, 'หมายเหตุ'),
})

export const advanceListQuerySchema = z.object({
  status: z.enum(['all', 'pending_approval', 'approved', 'overdue', 'cleared', 'rejected', 'uncleared']).default('all'),
  payeeId: uuidSchema.optional(),
})

export type AdvanceCreateInput = z.infer<typeof advanceCreateSchema>
export type AdvanceApproveInput = z.infer<typeof advanceApproveSchema>
export type AdvanceRejectInput = z.infer<typeof advanceRejectSchema>
export type AdvanceSettleInput = z.infer<typeof advanceSettleSchema>
export type AdvanceListQuery = z.infer<typeof advanceListQuerySchema>
