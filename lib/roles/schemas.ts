import { z } from 'zod'
import { MATRIX_LEVELS } from '@/lib/roles/matrix'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE (Rule 04 · Rule 13) ของโมดูล Roles & Permissions
 *
 * `reason` บังคับทุก mutation เพราะ `roles`/`role_capabilities` เป็นตารางหมวด **สิทธิ์**
 * (`90` §13 · `lib/audit/reason-policy.ts` — ไม่ส่งมาก็โดน `AUDIT_REASON_REQUIRED` ที่ชั้น audit อยู่ดี
 * แต่ดักที่ schema ก่อนเพื่อให้ผู้ใช้เห็น inline error แทน 500)
 */

const REASON_MIN = 5
const REASON_MAX = 500

export const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, `กรุณาระบุเหตุผลอย่างน้อย ${REASON_MIN} ตัวอักษร`)
  .max(REASON_MAX, `เหตุผลยาวเกิน ${REASON_MAX} ตัวอักษร`)

export const roleGroupSchema = z.enum(['system', 'inhouse', 'outsource', 'finance_company'])

export const matrixLevelSchema = z.enum(MATRIX_LEVELS)

export const permissionEntrySchema = z.object({
  capabilityCode: z.string().trim().min(1, 'ต้องระบุรหัสความสามารถ'),
  level: matrixLevelSchema,
})

export const rolePermissionUpdateSchema = z.object({
  entries: z
    .array(permissionEntrySchema)
    .min(1, 'ไม่มีรายการสิทธิ์ที่จะบันทึก')
    .max(200, 'รายการสิทธิ์เกินขนาดที่รับได้')
    .refine(
      (entries) => new Set(entries.map((entry) => entry.capabilityCode)).size === entries.length,
      'มีรหัสความสามารถซ้ำในรายการเดียวกัน',
    ),
  reason: reasonSchema,
})

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2, 'ชื่อบทบาทสั้นเกินไป').max(80, 'ชื่อบทบาทยาวเกินไป'),
  roleGroup: roleGroupSchema,
  reason: reasonSchema,
})

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(2, 'ชื่อบทบาทสั้นเกินไป').max(80, 'ชื่อบทบาทยาวเกินไป').optional(),
  isEditable: z.boolean().optional(),
  reason: reasonSchema,
})

export const roleDeleteSchema = z.object({ reason: reasonSchema })

export type RolePermissionUpdateInput = z.infer<typeof rolePermissionUpdateSchema>
export type RoleCreateInput = z.infer<typeof roleCreateSchema>
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>
export type RoleDeleteInput = z.infer<typeof roleDeleteSchema>

/** แปลง Zod error → field errors สำหรับ response 400 (`24` §6.1 `REQUIRED_MISSING`) */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_'
    if (fields[path] === undefined) fields[path] = issue.message
  }
  return fields
}
