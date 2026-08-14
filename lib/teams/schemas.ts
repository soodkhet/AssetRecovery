import { z } from 'zod'
import { reasonSchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของโมดูลทีม (ไฟล์ 09 · Rule 04 · Rule 13)
 *
 * จุดบังคับของไฟล์ 09: **`compensation_plan_id` บังคับเสมอตอนสร้างทีม** (§7 — ไม่มีทีมไหน
 * ไม่มีแผนค่าตอบแทน เพื่อให้ `38` §7.4 ดึงต้นทุนทีมมาแสดงได้ทุกทีม) · `supervisor_id` เป็น
 * ค่าเดี่ยว nullable ส่วน `manager_ids` เป็น array (N:N ผ่าน `team_managers` — §7.1)
 *
 * `reason` บังคับทุก mutation: ทีมผูกแผนค่าตอบแทน = กระทบ **เงิน** และ scope การมองเห็นข้อมูล
 * = กระทบ **สิทธิ์** (`90` §13)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const teamSideSchema = z.enum(['inhouse', 'outsource'])
export const teamStatusSchema = z.enum(['active', 'inactive'])

const teamFields = z.object({
  name: z.string().trim().min(2, 'ชื่อทีมสั้นเกินไป').max(120, 'ชื่อทีมยาวเกินไป'),
  side: teamSideSchema,
  compensationPlanId: uuidSchema,
  supervisorId: uuidSchema.nullable().default(null),
  managerIds: z.array(uuidSchema).max(20, 'เลือกผู้จัดการได้ไม่เกิน 20 คน').default([]),
  provinces: z
    .array(z.string().trim().min(1))
    .min(1, 'ต้องเลือกจังหวัดที่ดูแลอย่างน้อย 1 จังหวัด')
    .max(77, 'เลือกจังหวัดเกินจำนวนที่เป็นไปได้'),
  status: teamStatusSchema.default('active'),
})

/** ตัวทีมล้วน (ไม่มี `reason`) — FE ใช้ตรวจฟอร์มก่อนเปิดกล่องยืนยันเหตุผล */
export const teamFieldsSchema = teamFields

export const teamCreateSchema = teamFields.extend({ reason: reasonSchema })

/** PATCH ส่งค่าทั้งชุดเหมือนตอนสร้าง (ฟอร์มเดียวกัน) — ไม่ใช่ partial patch */
export const teamUpdateSchema = teamCreateSchema

/** เพิ่ม/ถอดผู้จัดการรายคน (`09` §14 `POST|DELETE /:id/managers`) */
export const teamManagerSchema = z.object({
  userId: uuidSchema,
  reason: reasonSchema,
})

export const teamDeleteSchema = z.object({ reason: reasonSchema })

export const teamListQuerySchema = z.object({
  side: teamSideSchema.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  province: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).max(120).optional(),
})

export type TeamFieldsInput = z.infer<typeof teamFieldsSchema>
export type TeamCreateInput = z.infer<typeof teamCreateSchema>
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>
export type TeamManagerInput = z.infer<typeof teamManagerSchema>
export type TeamListQuery = z.infer<typeof teamListQuerySchema>
