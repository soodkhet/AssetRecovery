import { z } from 'zod'
import { pctSchema, reasonSchema, requiredIdSchema } from '@/lib/api/validation'
import { BRANCH_CODE_PATTERN } from '@/lib/format/branch'
import { WHT_CONDITIONS } from '@/lib/payees/payee'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของผู้รับเงิน (ไฟล์ 18 · Rule 13)
 *
 * **`reason` บังคับทุก mutation** — `payee_profiles` ถูกจัดเป็นตารางหมวด `bank` ใน
 * `lib/audit/reason-policy.ts` (`18` §13 · Rule 03) ⇒ ไม่มี endpoint ไหนแก้ได้โดยไม่มีเหตุผล
 *
 * ที่นี่ตรวจแค่ **รูปร่างของ input** — กติกาธุรกิจ (auto-reset / ความพร้อมก่อนยืนยัน / เทียบชื่อบัญชี)
 * อยู่ที่ `lib/payees/payee.ts` ที่เดียว
 */

const uuidSchema = z.string().guid('รูปแบบรหัสไม่ถูกต้อง')

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

export const whtConditionSchema = z.enum(WHT_CONDITIONS)

/**
 * ที่อยู่ผู้ถูกหักภาษี (มติ PO U94 ข้อ 1) — โครงเดียวกับ `AddressFields` / ที่อยู่ของเคส
 * ทุกช่องว่างได้ตอนบันทึก · ความครบถูกบังคับตอน "ยืนยัน" (`missingFieldsForVerification()`)
 */
export const payeeAddressSchema = z.object({
  detail: optionalText(500, 'บ้านเลขที่/ถนน'),
  postalCode: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().regex(/^\d{5}$/, 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก').nullable().default(null),
  ),
  province: optionalText(100, 'จังหวัด'),
  district: optionalText(100, 'อำเภอ/เขต'),
  subdistrict: optionalText(100, 'ตำบล/แขวง'),
})

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
  /** มติ PO U150 — path ไฟล์จากกลไกอัปโหลดของ server (target `payee_id_document`) · server ตรวจไฟล์ + SHA-256 ตอนบันทึก */
  idDocumentUrl: optionalText(1024, 'path ของไฟล์เอกสารยืนยันตัวตน'),
  /**
   * อัตราหัก 40(2) ต่อคน (มติ PO 05/10/2569 UAT U7) — 0.00–100.00 · ว่าง = ยังไม่กรอก
   * ไม่ส่งมา (`undefined`) = **คงค่าเดิม** ตอนแก้ไข / ว่างตอนสร้าง — กันผู้เรียกที่ไม่รู้จักฟิลด์ล้างอัตราทิ้ง
   */
  wht402Pct: z.preprocess(
    (value) => (value === '' ? null : typeof value === 'string' ? Number(value) : value),
    pctSchema('อัตราหัก 40(1)/40(2)').nullable().optional(),
  ),
  /**
   * ข้อมูลผู้ถูกหักบนใบ 50 ทวิ (มติ PO 06/10/2569 UAT U94 ข้อ 1) — ไม่ส่งมา (`undefined`) = **คงค่าเดิม**
   * ตอนแก้ไข (กันผู้เรียกที่ไม่รู้จักฟิลด์ล้างข้อมูลทิ้ง) · ตอนสร้าง = ว่าง/ค่าเริ่มต้น
   */
  nameTitle: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(50, 'คำนำหน้าชื่อยาวเกิน 50 ตัวอักษร').nullable().optional(),
  ),
  address: payeeAddressSchema.optional(),
  /** นิติบุคคล: `00000` = สำนักงานใหญ่ · สาขา = ตัวเลข 5 หลัก */
  branchCode: z
    .string()
    .trim()
    .refine((value) => BRANCH_CODE_PATTERN.test(value), 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)')
    .optional(),
  whtCondition: whtConditionSchema.optional(),
})

export const payeeCreateSchema = payeeFieldsSchema.extend({
  /** เจ้าของ Payee — 1 User = 1 Payee Profile (`18` §6.1) */
  userId: requiredIdSchema('ผู้ใช้'),
  reason: reasonSchema,
})

export const payeeUpdateSchema = payeeFieldsSchema.extend({ reason: reasonSchema })

/** ยืนยัน Payee (`18` §9) — ไม่มีฟิลด์ให้แก้ มีแต่เหตุผล (กระทบธนาคาร/ภาษี ⇒ reason บังคับ) */
export const payeeVerifySchema = z.object({ reason: reasonSchema })

/**
 * ส่วน "ข้อมูลรับเงิน" ในฟอร์มเพิ่ม/แก้ผู้ใช้ (มติ PO U131) — ฟิลด์ชุดเดียวกับฟอร์ม Payee
 * + ติ๊ก "ยืนยันข้อมูลรับเงิน" (สิทธิ์/audit เดิมของการยืนยัน) + เหตุผล (หมวด bank — บังคับเหมือน API ผู้รับเงิน)
 * ฟอร์มส่งส่วนนี้เฉพาะเมื่อแก้ข้อมูลในส่วนนี้หรือติ๊กยืนยัน · ไม่ส่ง = ไม่แตะ Payee
 */
export const userPaymentSchema = z.object({
  fields: payeeFieldsSchema,
  verify: z.boolean().default(false),
  reason: reasonSchema,
})

export type UserPaymentSchemaInput = z.infer<typeof userPaymentSchema>

export const payeeListQuerySchema = z.object({
  status: z.enum(['all', 'verified', 'unverified']).default('all'),
  search: z.string().trim().max(120).optional(),
})

export type PayeeFieldsInput = z.infer<typeof payeeFieldsSchema>
export type PayeeAddressInput = z.infer<typeof payeeAddressSchema>
export type PayeeCreateInput = z.infer<typeof payeeCreateSchema>
export type PayeeUpdateInput = z.infer<typeof payeeUpdateSchema>
export type PayeeListQuery = z.infer<typeof payeeListQuerySchema>
