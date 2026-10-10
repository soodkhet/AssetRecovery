import { z } from 'zod'
import { isDueClearDateInPast } from '@/lib/advances/advance'
import { dateOnlySchema, satangSchema } from '@/lib/api/validation'
import { substituteReceiptDraftSchema } from '@/lib/substitute-receipts/schemas'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของเงินทดรองจ่าย (ไฟล์ 15 · Rule 13)
 *
 * ที่นี่ตรวจแค่ **รูปร่างของ input** — กติกาธุรกิจ (ห้ามเบิกซ้อน / เพดาน / สถานะ) อยู่ที่
 * `lib/advances/advance.ts` และสูตรยอดคืนอยู่ที่ `lib/finance/advance-calc.ts` (3.1) ที่เดียว
 *
 * ⚠️ `dueClearDate` เป็นคอลัมน์ `DATE` ⇒ ใช้ `dateOnlySchema()` (เที่ยงคืน **UTC**)
 * ห้ามใช้ `fromInputDate()` ซึ่งให้เที่ยงคืนไทย = วันที่เพี้ยนไป 1 วัน (ดู REUSE_INDEX)
 */

const uuidSchema = z.string().guid('รูปแบบรหัสไม่ถูกต้อง')

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

/** วิธีคืนยอด (มติ PO 05/10/2569 UAT U30) */
export const advanceReturnMethodSchema = z.enum(['payout_offset', 'separate'])

/** เคลียร์ยอด (`15` §9.1) — ยอดคืนคำนวณโดย DB (generated column) ห้ามส่งมาจากหน้าจอ */
export const advanceSettleSchema = z.object({
  usedSatang: satangSchema('ยอดที่ใช้จริง'),
  /** มติ U30 — มียอดคืนเท่านั้นที่มีผล · เว้นว่าง = หักกลบในรอบจ่ายถัดไป (ค่าเริ่มต้น) */
  returnMethod: advanceReturnMethodSchema.default('payout_offset'),
  /**
   * มติ PO U143 — **path ใบเสร็จจากกลไกอัปโหลดของ server** (target `expense_receipt`) ไม่ใช่ข้อความพิมพ์เอง
   * server ตรวจไฟล์ + SHA-256 แล้วบันทึกลง audit (ตาราง `advances` ไม่มีคอลัมน์เก็บ — `15` §13) และส่งต่อเป็น
   * ใบเสร็จของคำขอเบิกส่วนเกิน (ถ้ามี)
   */
  receiptFileUrl: optionalText(1024, 'path ของไฟล์ใบเสร็จ'),
  note: optionalText(500, 'หมายเหตุ'),
  /**
   * มติ PO U103 — ติ๊ก "ไม่มีใบเสร็จ" → รายจ่ายที่ไม่มีใบเสร็จ ระบบออกใบรับรองแทนใบเสร็จ (CRT) ผูกกับเงินทดรองนี้
   * ยอดรวมของรายการต้องไม่เกินยอดที่ใช้จริง (ส่วนที่เหลือมีใบเสร็จจริง)
   */
  substituteReceipt: substituteReceiptDraftSchema.nullable().default(null),
}).superRefine((value, ctx) => {
  // มติ PO U143 — มีรายจ่าย ⇒ ต้องแนบใบเสร็จ หรือใช้ใบรับรองแทนใบเสร็จ (กติกาเดิม U103) อย่างน้อยหนึ่งอย่าง
  if (value.usedSatang > 0 && value.receiptFileUrl === null && value.substituteReceipt === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['receiptFileUrl'],
      message: 'ต้องแนบใบเสร็จ หรือติ๊ก "ไม่มีใบเสร็จ" แล้วกรอกรายการ',
    })
  }
  if (value.substituteReceipt === null) return
  const total = value.substituteReceipt.lines.reduce((sum, line) => sum + line.amountSatang, 0)
  if (total > value.usedSatang) {
    ctx.addIssue({
      code: 'custom',
      path: ['substituteReceipt'],
      message: 'ยอดรวมรายการที่ไม่มีใบเสร็จต้องไม่เกินยอดที่ใช้จริง',
    })
  }
})

/** เปลี่ยนวิธีคืน (การเงิน · มติ U30) — ต้องมีเหตุผลเสมอ (กระทบเงิน) */
export const advanceReturnMethodChangeSchema = z.object({
  returnMethod: advanceReturnMethodSchema,
  reason: z.string().trim().min(5, 'ระบุเหตุผลอย่างน้อย 5 ตัวอักษร').max(500, 'เหตุผลยาวเกินไป'),
})

/** staging E-012 — การเงินตรวจการเคลียร์แล้ว (หมายเหตุไม่บังคับ) */
export const advanceClearReviewSchema = z.object({
  note: z
    .string()
    .trim()
    .max(500, 'หมายเหตุยาวเกินไป')
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value)),
})

/** staging E-012 — ตีกลับการเคลียร์ (เหตุผลบังคับ — ผู้ขอเห็นในแจ้งเตือน) */
export const advanceReopenClearSchema = z.object({
  reason: z.string().trim().min(5, 'ระบุเหตุผลอย่างน้อย 5 ตัวอักษร').max(500, 'เหตุผลยาวเกินไป'),
})

/**
 * รับคืนแยก (การเงิน · มติ U30) — ช่องทาง + วันที่ + ยอด + หลักฐาน (path จากกลไกอัปโหลดผ่าน server)
 * `receivedDate` เป็นคอลัมน์ `DATE` ⇒ `dateOnlySchema()` (เที่ยงคืน UTC)
 */
export const advanceSeparateReturnSchema = z.object({
  channel: z.enum(['cash', 'bank_transfer']),
  amountSatang: satangSchema('ยอดที่รับคืน').refine((value) => value > 0, 'ยอดที่รับคืนต้องมากกว่า 0'),
  receivedDate: dateOnlySchema('วันที่รับคืน'),
  evidenceFilePath: z.string().trim().min(1, 'แนบหลักฐานการรับคืน').max(1024, 'path ของไฟล์ยาวเกินไป'),
  note: optionalText(500, 'หมายเหตุ'),
})

export const advanceListQuerySchema = z.object({
  status: z
    .enum(['all', 'pending_approval', 'approved', 'overdue', 'cleared', 'rejected', 'uncleared', 'return_outstanding'])
    .default('all'),
  payeeId: uuidSchema.optional(),
})

export type AdvanceCreateInput = z.infer<typeof advanceCreateSchema>
export type AdvanceApproveInput = z.infer<typeof advanceApproveSchema>
export type AdvanceRejectInput = z.infer<typeof advanceRejectSchema>
export type AdvanceClearReviewInput = z.infer<typeof advanceClearReviewSchema>
export type AdvanceReopenClearInput = z.infer<typeof advanceReopenClearSchema>
/** `returnMethod` ไม่ระบุ = ค่าเริ่มต้นหักกลบ (ผู้เรียกฝั่ง server/เทสต์ที่ไม่ได้ผ่าน schema) */
export type AdvanceSettleInput = Omit<z.infer<typeof advanceSettleSchema>, 'returnMethod' | 'substituteReceipt'> & {
  returnMethod?: z.infer<typeof advanceReturnMethodSchema>
  substituteReceipt?: z.infer<typeof advanceSettleSchema>['substituteReceipt']
}
export type AdvanceListQuery = z.infer<typeof advanceListQuerySchema>
export type AdvanceReturnMethodChangeInput = z.infer<typeof advanceReturnMethodChangeSchema>
export type AdvanceSeparateReturnInput = z.infer<typeof advanceSeparateReturnSchema>
