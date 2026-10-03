import { z } from 'zod'
import { reasonSchema, requiredIdSchema } from '@/lib/api/validation'
import { USERNAME_PATTERN } from '@/lib/auth/login-identifier'
import { passwordPairFields, refinePasswordPair } from '@/lib/auth/schemas'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของโมดูลผู้ใช้งาน (ไฟล์ 08 · Rule 04 · Rule 13)
 *
 * - `status` **ไม่อยู่ในฟอร์ม** — เปลี่ยนผ่าน endpoint แยก (`PATCH /:id/suspend|reactivate` — `08` §14)
 *   ตาม Rule 04 (transition endpoint) เพื่อบังคับ `reason` และยาม lifecycle ให้ครบทุกทาง
 * - `team_id`/`company_id` เป็น nullable ที่ชั้น schema แล้วบังคับ conditional required ตาม role group
 *   ที่ `assertScopeConsistent()` (ต้องรู้ role group ของ `role_id` ก่อน จึงตรวจที่ชั้น business logic)
 * - `reason` บังคับเฉพาะ **ระงับ/เปิดใช้/ลบ** (`90` §13) · สร้าง/แก้ไข/ตั้งรหัสผ่านไม่มีช่องเหตุผล (มติ PO
 *   03/10/2569): สร้าง = flow ปกติตาม `lib/audit/reason-policy.ts` · แก้ไข = ระบบสรุปสิ่งที่เปลี่ยนเป็นเหตุผล
 *   (`describeUserChanges`) · ตั้งรหัส = ระบบเติมเหตุผลมาตรฐาน
 * - มติ PO 03/10/2569: `username` บังคับ · `email` ไม่บังคับ · ตอนสร้างผู้ดูแลตั้งรหัสผ่านให้เลย
 *   (ไม่ส่งอีเมลเชิญ) · แก้ไขผู้ใช้ไม่แตะรหัสผ่าน — ตั้งใหม่ผ่าน `POST /api/users/:id/password` เท่านั้น
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

/** ช่องที่ฟอร์มส่งค่าว่างมาเสมอ → แปลงเป็น null ก่อนตรวจรูปแบบ (กับดักเดียวกับไฟล์ 09/10) */
const optionalText = (schema: z.ZodTypeAny) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), schema)

/** เบอร์โทรไทย: ตัวเลข 9–10 หลักหลังตัดตัวคั่น (`08` §7.1 — optional) */
const phoneSchema = optionalText(
  z
    .string()
    .trim()
    .regex(/^[0-9\s\-().]+$/, 'เบอร์โทรต้องเป็นตัวเลข')
    .transform((value) => value.replace(/[\s\-().]/g, ''))
    .refine((value) => value.length >= 9 && value.length <= 10, 'เบอร์โทรต้องมี 9–10 หลัก')
    .nullable(),
).pipe(z.string().nullable())

const userFields = z.object({
  roleId: requiredIdSchema('บทบาท'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'ต้องระบุชื่อผู้ใช้')
    .regex(USERNAME_PATTERN, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3–50 ตัว และขึ้นต้นด้วยตัวอักษรหรือตัวเลข'),
  email: optionalText(
    z.string().trim().toLowerCase().max(255, 'อีเมลยาวเกินไป').email('รูปแบบอีเมลไม่ถูกต้อง').nullable(),
  )
    .pipe(z.string().nullable())
    .default(null),
  fullName: z.string().trim().min(2, 'ชื่อ-นามสกุลสั้นเกินไป').max(200, 'ชื่อ-นามสกุลยาวเกินไป'),
  phone: phoneSchema.default(null),
  employeeCode: optionalText(z.string().trim().max(50, 'รหัสพนักงานยาวเกินไป').nullable())
    .pipe(z.string().nullable())
    .default(null),
  teamId: uuidSchema.nullable().default(null),
  companyId: uuidSchema.nullable().default(null),
})

/** ตัวผู้ใช้ล้วน (ไม่มี `reason`) — FE ใช้ตรวจฟอร์มก่อนเปิดกล่องยืนยันเหตุผล */
export const userFieldsSchema = userFields

/** สร้างผู้ใช้ = ข้อมูลผู้ใช้ + รหัสผ่านเริ่มต้นที่ผู้ดูแลตั้งให้ (ผู้ใช้ต้องเปลี่ยนเองตอน login ครั้งแรก) · ไม่มีเหตุผล */
export const userCreateSchema = refinePasswordPair(userFields.extend(passwordPairFields.shape))

/** PATCH ส่งค่าทั้งชุดเหมือนตอนสร้าง (ฟอร์มเดียวกัน) — ไม่ใช่ partial patch · ไม่มีรหัสผ่าน/เหตุผล */
export const userUpdateSchema = userFields

/**
 * `POST /api/finance-companies/:id/users` (`10` §14) — สร้างบัญชีฝั่งบริษัทไฟแนนซ์
 * `company_id` มาจาก path ไม่ใช่ body (กันสร้างข้ามบริษัท) · `team_id` ใช้กับกลุ่มนี้ไม่ได้อยู่แล้ว
 */
export const companyUserCreateSchema = refinePasswordPair(
  userFields
    .omit({ teamId: true, companyId: true })
    .extend(passwordPairFields.shape),
)

/** `POST /api/users/:id/password` — ผู้ดูแลตั้งรหัสผ่านใหม่ให้ · ไม่มีช่องเหตุผล (ระบบเติม `ADMIN_PASSWORD_RESET_REASON`) */
export const userPasswordResetSchema = refinePasswordPair(passwordPairFields)

/** เหตุผลที่ระบบเติมลง audit ตอนผู้ดูแลตั้งรหัสผ่านใหม่ — `supabase_uid` อาจเปลี่ยน (ฟิลด์สิทธิ์ใน reason-policy) */
export const ADMIN_PASSWORD_RESET_REASON = 'ผู้ดูแลตั้งรหัสผ่านใหม่ให้ผู้ใช้'

/** `PATCH /:id/suspend` และ `/reactivate` (`08` §14) — เหตุผลบังคับทั้งคู่ (`08` §13) */
export const userStatusChangeSchema = z.object({ reason: reasonSchema })

export const userDeleteSchema = z.object({ reason: reasonSchema })

export const userListQuerySchema = z.object({
  /** แท็บ/ตัวกรองกลุ่ม — ส่งได้หลายค่าเพื่อรองรับแท็บ "เจ้าหน้าที่ติดตามทรัพย์" (inhouse+outsource) */
  roleGroup: z
    .string()
    .trim()
    .transform((value) => value.split(',').map((each) => each.trim()))
    .pipe(z.array(z.enum(['system', 'inhouse', 'outsource', 'finance_company'])).min(1))
    .optional(),
  roleId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
  companyId: uuidSchema.optional(),
  status: z.enum(['active', 'suspended', 'all']).default('all'),
  search: z.string().trim().min(1).max(120).optional(),
})

export type CompanyUserCreateInput = z.infer<typeof companyUserCreateSchema>
export type UserFieldsInput = z.infer<typeof userFieldsSchema>
export type UserCreateInput = z.infer<typeof userCreateSchema>
export type UserUpdateInput = z.infer<typeof userUpdateSchema>
export type UserStatusChangeInput = z.infer<typeof userStatusChangeSchema>
export type UserPasswordResetInput = z.infer<typeof userPasswordResetSchema>
export type UserListQuery = z.infer<typeof userListQuerySchema>
