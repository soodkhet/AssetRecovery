import { z } from 'zod'
import { reasonSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของผู้รับเงิน (ไฟล์ 18 · Rule 13)
 *
 * **`reason` บังคับทุก mutation** — `payee_profiles` ถูกจัดเป็นตารางหมวด `bank` ใน
 * `lib/audit/reason-policy.ts` (`18` §13 · Rule 03) ⇒ ไม่มี endpoint ไหนแก้ได้โดยไม่มีเหตุผล
 *
 * ที่นี่ตรวจแค่ **รูปร่างของ input** — กติกาธุรกิจ (auto-reset / ความพร้อมก่อนยืนยัน / เทียบชื่อบัญชี)
 * อยู่ที่ `lib/payees/payee.ts` ที่เดียว
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

/** ช่องข้อความที่ปล่อยว่างได้ — ฟอร์มส่ง `''` มาเสมอ ต้องกลายเป็น null ก่อนตรวจรูปแบบ */
const optionalText = (max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `${label}ยาวเกิน ${max} ตัวอักษร`).nullable().default(null),
  )

const optionalUuid = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  uuidSchema.nullable().default(null),
)

export const payeeTypeSchema = z.enum(['individual', 'corporate'])

/**
 * ฟิลด์ของฟอร์ม (`18` §8) — ทุกช่องยกเว้นประเภทปล่อยว่างได้ตอนสร้าง เพราะ payee โครงเปล่าเกิด
 * อัตโนมัติจาก `ensureAgentPayeeId()` (Phase 2.9) ตั้งแต่พนักงานปิดงานเคสแรก แล้วการเงินมาเติมทีหลัง
 * — ความครบถ้วนถูกบังคับตอน **ยืนยัน** ไม่ใช่ตอนบันทึก (`18` §9)
 */
export const payeeFieldsSchema = z.object({
  payeeType: payeeTypeSchema,
  taxProfileId: optionalUuid,
  /** เลขบัตรประชาชน/ทะเบียนนิติบุคคล — ตรวจรูปแบบ 13 หลักที่ `assertPayeeNationalId()` (`18` §7.1) */
  nationalId: optionalText(20, 'เลขประจำตัวผู้เสียภาษี'),
  bankName: optionalText(120, 'ชื่อธนาคาร'),
  accountName: optionalText(120, 'ชื่อบัญชี'),
  accountNumber: optionalText(30, 'เลขบัญชี'),
  idDocumentUrl: optionalText(500, 'ลิงก์เอกสารยืนยันตัวตน'),
})

export const payeeCreateSchema = payeeFieldsSchema.extend({
  /** เจ้าของ Payee — 1 User = 1 Payee Profile (`18` §6.1) */
  userId: uuidSchema,
  reason: reasonSchema,
})

export const payeeUpdateSchema = payeeFieldsSchema.extend({ reason: reasonSchema })

/** ยืนยัน Payee (`18` §9) — ไม่มีฟิลด์ให้แก้ มีแต่เหตุผล (กระทบธนาคาร/ภาษี ⇒ reason บังคับ) */
export const payeeVerifySchema = z.object({ reason: reasonSchema })

export const payeeListQuerySchema = z.object({
  status: z.enum(['all', 'verified', 'unverified']).default('all'),
  search: z.string().trim().max(120).optional(),
})

export type PayeeFieldsInput = z.infer<typeof payeeFieldsSchema>
export type PayeeCreateInput = z.infer<typeof payeeCreateSchema>
export type PayeeUpdateInput = z.infer<typeof payeeUpdateSchema>
export type PayeeListQuery = z.infer<typeof payeeListQuerySchema>
