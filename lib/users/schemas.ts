import { z } from 'zod'
import { reasonSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของโมดูลผู้ใช้งาน (ไฟล์ 08 · Rule 04 · Rule 13)
 *
 * - `status` **ไม่อยู่ในฟอร์ม** — เปลี่ยนผ่าน endpoint แยก (`PATCH /:id/suspend|reactivate` — `08` §14)
 *   ตาม Rule 04 (transition endpoint) เพื่อบังคับ `reason` และยาม lifecycle ให้ครบทุกทาง
 * - `team_id`/`company_id` เป็น nullable ที่ชั้น schema แล้วบังคับ conditional required ตาม role group
 *   ที่ `assertScopeConsistent()` (ต้องรู้ role group ของ `role_id` ก่อน จึงตรวจที่ชั้น business logic)
 * - `reason` บังคับทุก mutation: ผู้ใช้ = **สิทธิ์** (`90` §13 — เปลี่ยน role/สถานะกระทบการเข้าถึงข้อมูล)
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
  roleId: uuidSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'ต้องระบุอีเมล')
    .max(255, 'อีเมลยาวเกินไป')
    .email('รูปแบบอีเมลไม่ถูกต้อง'),
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

export const userCreateSchema = userFields.extend({ reason: reasonSchema })

/** PATCH ส่งค่าทั้งชุดเหมือนตอนสร้าง (ฟอร์มเดียวกัน) — ไม่ใช่ partial patch */
export const userUpdateSchema = userCreateSchema

/**
 * `POST /api/finance-companies/:id/users` (`10` §14) — สร้างบัญชีฝั่งบริษัทไฟแนนซ์
 * `company_id` มาจาก path ไม่ใช่ body (กันสร้างข้ามบริษัท) · `team_id` ใช้กับกลุ่มนี้ไม่ได้อยู่แล้ว
 */
export const companyUserCreateSchema = userFields
  .omit({ teamId: true, companyId: true })
  .extend({ reason: reasonSchema })

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
export type UserListQuery = z.infer<typeof userListQuerySchema>
