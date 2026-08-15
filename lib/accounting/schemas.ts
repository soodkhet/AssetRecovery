import { z } from 'zod'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของรอบบัญชี (ไฟล์ 30) + ข้อยกเว้น (ไฟล์ 34) — Rule 13
 *
 * ⚠️ `authorizeNote` ที่นี่ตรวจแค่ "เป็นสตริง" — ความยาวขั้นต่ำบังคับด้วย `assertAuthorizeNote()`
 *    (pure) เพื่อให้ผู้ใช้ได้ code `AUTHORIZED_EXCEPTION_REASON_REQUIRED` ตรงตาม `34` §11
 *    ไม่ใช่ field error ทั่วไป
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const exceptionLevelSchema = z.enum(['info', 'warning', 'critical'])
export const exceptionStatusSchema = z.enum(['open', 'resolved', 'authorized'])

export const exceptionListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  level: exceptionLevelSchema.optional(),
  status: exceptionStatusSchema.optional(),
  /** `source_module` เป็น free text (`02` §9) — กรองแบบตรงตัว */
  module: z.string().trim().max(50).optional(),
})

export const exceptionCreateSchema = z.object({
  /** ไม่ส่งมา = รอบบัญชีของเดือนปัจจุบัน (สร้างให้อัตโนมัติถ้ายังไม่มี) */
  periodId: uuidSchema.optional(),
  level: exceptionLevelSchema,
  title: z.string().trim().min(1, 'ต้องระบุหัวข้อ').max(200),
  description: z.string().trim().min(1, 'ต้องระบุรายละเอียด').max(2000),
  sourceModule: z.string().trim().min(1, 'ต้องระบุโมดูล').max(50),
  sourceRef: z.string().trim().max(100).nullable().default(null),
})

/** แก้ไขได้เฉพาะขณะ `open` (`34` §14) — สถานะไม่อยู่ในฟอร์มนี้ (เปลี่ยนผ่าน action เท่านั้น) */
export const exceptionUpdateSchema = z
  .object({
    level: exceptionLevelSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    sourceModule: z.string().trim().min(1).max(50).optional(),
    sourceRef: z.string().trim().max(100).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'ต้องระบุอย่างน้อย 1 ฟิลด์ที่จะแก้')

export const exceptionResolveSchema = z.object({
  resolutionNote: z.string().trim().min(1, 'ต้องอธิบายว่าแก้ไขอย่างไร').max(1000),
})

export const exceptionAuthorizeSchema = z.object({
  authorizeNote: z.string().max(1000),
})

export const periodListQuerySchema = z.object({
  yearBe: z.coerce.number().int().min(2500).max(2700).optional(),
  limit: z.coerce.number().int().min(1).max(36).default(12),
})

/** ล็อก/ปลดล็อกรอบ — `reason` บังคับตามนโยบาย audit (`90` §13 · `30` §13) */
export const periodReasonSchema = z.object({
  reason: z.string().trim().min(1, 'ต้องระบุเหตุผล').max(1000),
})

// ── ข้อซักถามจากสำนักงานบัญชี (ไฟล์ 36 §13) ────────────────────────────────

export const questionListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  /** `open` = ยังไม่ตอบ · `answered` = ตอบแล้ว (map เป็น `is_resolved` — `36` §6.1) */
  status: z.enum(['open', 'answered']).optional(),
})

export const questionCreateSchema = z.object({
  /** ไม่ส่งมา = รอบบัญชีของเดือนปัจจุบัน (สร้างให้อัตโนมัติถ้ายังไม่มี) */
  periodId: uuidSchema.optional(),
  questionText: z.string().trim().min(1, 'ต้องระบุคำถาม').max(2000),
})

export const questionAnswerSchema = z.object({
  answerText: z.string().trim().min(1, 'ต้องระบุคำตอบ').max(2000),
})

export type QuestionListQuery = z.infer<typeof questionListQuerySchema>
export type QuestionCreateInput = z.infer<typeof questionCreateSchema>
export type QuestionAnswerInput = z.infer<typeof questionAnswerSchema>

export type ExceptionListQuery = z.infer<typeof exceptionListQuerySchema>
export type ExceptionCreateInput = z.infer<typeof exceptionCreateSchema>
export type ExceptionUpdateInput = z.infer<typeof exceptionUpdateSchema>
export type ExceptionResolveInput = z.infer<typeof exceptionResolveSchema>
export type ExceptionAuthorizeInput = z.infer<typeof exceptionAuthorizeSchema>
export type PeriodListQuery = z.infer<typeof periodListQuerySchema>
export type PeriodReasonInput = z.infer<typeof periodReasonSchema>
