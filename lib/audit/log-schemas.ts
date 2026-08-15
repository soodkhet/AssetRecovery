import { z } from 'zod'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของ `GET /api/audit-logs` (`90` §14) — Rule 13
 *
 * ตัวกรองตามสเปค: `target_type` · `actor_id` · ช่วงวันที่ (+ `action` และคำค้น target id
 * ที่หน้าจอต้องใช้จริงตาม mockup `settings.html` แท็บ `auditlog`)
 *
 * ⚠️ ช่วงวันที่รับเป็น `YYYY-MM-DD` (`<input type="date">` — ข้อยกเว้นเดียวที่เป็น ค.ศ. ตาม DEC-005)
 *    แล้วแปลงเป็นช่วงเวลา **ตามวันไทย** ที่ชั้น query ไม่ใช่ที่ FE
 */

export const AUDIT_LOG_PAGE_SIZE_MAX = 100
export const AUDIT_LOG_PAGE_SIZE_DEFAULT = 50

export const auditActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'status_change',
  'approve',
  'reject',
  'confirm',
  'lock',
  'unlock',
  'export',
  'import',
  'login',
  'logout',
])

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')

export const auditLogListQuerySchema = z.object({
  /** ชื่อตารางปลายทาง (snake_case ตาม `02`) เช่น `cases` / `expenses` */
  targetType: z.string().trim().max(60).optional(),
  targetId: z.string().uuid('รูปแบบรหัสไม่ถูกต้อง').optional(),
  actorId: z.string().uuid('รูปแบบรหัสไม่ถูกต้อง').optional(),
  action: auditActionSchema.optional(),
  /** ตั้งแต่ (วันไทย 00:00) */
  dateFrom: dateOnly.optional(),
  /** ถึง (วันไทย 23:59:59.999) — รวมวันสุดท้ายเสมอ */
  dateTo: dateOnly.optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_LOG_PAGE_SIZE_MAX).default(AUDIT_LOG_PAGE_SIZE_DEFAULT),
  /** เลื่อนหน้าแบบ offset — audit เป็น append-only ลำดับจึงนิ่งพอสำหรับหน้าอ่านอย่างเดียว */
  offset: z.coerce.number().int().min(0).default(0),
})

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>
export type AuditLogAction = z.infer<typeof auditActionSchema>
