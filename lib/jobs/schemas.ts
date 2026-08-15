import { z } from 'zod'
import { DEV_TRIGGER_JOB_TYPES, JOB_TYPES, type JobTypeCode } from '@/lib/jobs/job-types'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของ Background Job (`91` §14) — Rule 13
 *
 * ⚠️ `idempotencyKey` **บังคับ**ทุกครั้งที่สร้าง job (`01` §11 · `91` §14) — คีย์ซ้ำ = คืน job เดิม
 *    (`91` §11) ไม่สร้างใหม่ · ผู้เรียกต้องประกอบคีย์จากสิ่งที่ระบุ "งานชิ้นเดียวกัน" เช่น
 *    `export_pack:<periodId>:v3` ไม่ใช่สุ่มค่าใหม่ทุกครั้ง (สุ่ม = สร้างงานซ้ำได้ตามใจ)
 */

export const JOB_PAGE_SIZE_MAX = 100
export const JOB_PAGE_SIZE_DEFAULT = 50

/** ความยาวสูงสุดของคีย์กันซ้ำ — พอสำหรับ `<job_type>:<uuid>:<suffix>` โดยไม่ให้ payload บวม */
export const JOB_IDEMPOTENCY_KEY_MAX = 200

export const jobTypeSchema = z.enum(JOB_TYPES)

/** สถานะที่กรองบนหน้า Job Log — รวม `dead_letter` ที่ derive จาก `failed` + retry เต็มเพดาน */
export const jobViewStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'dead_letter',
  'cancelled',
])

const payloadSchema = z.record(z.string(), z.unknown())

export const jobCreateSchema = z.object({
  jobType: jobTypeSchema,
  /** ข้อมูลที่ handler ต้องใช้ เช่น `{ periodId }` ของ `export_pack` — โครงขึ้นกับ job_type */
  payload: payloadSchema.default({}),
  idempotencyKey: z.string().trim().min(1, 'ต้องระบุคีย์กันซ้ำ').max(JOB_IDEMPOTENCY_KEY_MAX),
  /** เวลาที่เร็วที่สุดที่ให้เริ่มทำงาน (ISO UTC) — ไม่ระบุ = ทำได้ทันทีที่ตัวรันงานหยิบเจอ */
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
})

export type JobCreateInput = z.infer<typeof jobCreateSchema>

/**
 * `POST /api/dev/trigger-job` (`91` §14.1) — job_type จำกัดเฉพาะ 5 ตัวของ §6.1
 * (C8 ใน `docs/02_OPEN_DECISIONS.md`: ต้องครบ 5 ตัวรวม `advance_overdue`)
 */
export const jobDevTriggerSchema = z.object({
  jobType: z.enum(DEV_TRIGGER_JOB_TYPES as [JobTypeCode, ...JobTypeCode[]]),
  payload: payloadSchema.default({}),
})

export type JobDevTriggerInput = z.infer<typeof jobDevTriggerSchema>

/** สั่งทำงานใหม่ (`91` §14 — Superadmin เท่านั้น + ต้องมีเหตุผลลง audit) */
export const jobRetrySchema = z.object({
  reason: z.string().trim().min(5, 'ต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร').max(500),
})

export type JobRetryInput = z.infer<typeof jobRetrySchema>

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')

export const jobListQuerySchema = z.object({
  jobType: jobTypeSchema.optional(),
  status: jobViewStatusSchema.optional(),
  /** ตั้งแต่ (วันไทย 00:00) — `<input type="date">` เป็นข้อยกเว้นเดียวที่เป็น ค.ศ. (DEC-005) */
  dateFrom: dateOnly.optional(),
  /** ถึง (วันไทย 23:59:59.999) */
  dateTo: dateOnly.optional(),
  limit: z.coerce.number().int().min(1).max(JOB_PAGE_SIZE_MAX).default(JOB_PAGE_SIZE_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
})

export type JobListQuery = z.infer<typeof jobListQuerySchema>
export type JobViewStatusFilter = z.infer<typeof jobViewStatusSchema>
