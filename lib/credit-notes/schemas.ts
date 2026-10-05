import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'
import { MAX_STORAGE_PATH_LENGTH } from '@/lib/uploads/targets'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของใบลดหนี้ (มติ PO 05/10/2569 U14) — Rule 13
 *
 * ⚠️ ไม่มี field `totalSatang` / `vatRatePctUsed` — ยอดรวมคิดที่ server และอัตรา snapshot จากใบกำกับเดิมเสมอ
 * ⚠️ `vatSatang` ไม่ส่ง = ใช้ค่าที่คำนวณจากอัตราเดิม · ส่งมา = ยอดตามเอกสาร (ตรวจ ±1 สตางค์ที่ service)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

/** `credit` = ใบลดหนี้ (ม.86/10) · `debit` = ใบเพิ่มหนี้ (ม.86/9 — มติ PO U19) */
export const creditNoteTypeSchema = z.enum(['credit', 'debit'], { message: 'เลือกชนิดเอกสาร' })

export type CreditNoteType = z.infer<typeof creditNoteTypeSchema>

export const creditNoteCreateSchema = z.object({
  // ไม่ส่ง = ใบลดหนี้ (รองรับผู้เรียกเดิมก่อน U19)
  noteType: creditNoteTypeSchema.default('credit'),
  taxInvoiceId: uuidSchema,
  adjustmentId: uuidSchema.nullish(),
  creditNoteNumber: z.string().trim().min(1, 'กรอกเลขที่เอกสาร').max(50, 'เลขที่ยาวเกิน 50 ตัวอักษร'),
  issueDate: dateOnlySchema('วันที่ออกเอกสาร'),
  amountBeforeVatSatang: z.number().int('ยอดต้องเป็นสตางค์จำนวนเต็ม').positive('มูลค่าก่อนภาษีต้องมากกว่า 0'),
  vatSatang: z.number().int('ยอดต้องเป็นสตางค์จำนวนเต็ม').nonnegative('ภาษีติดลบไม่ได้').nullish(),
  // กระทบเงิน/ภาษี ⇒ เหตุผลบังคับ (Rule 03)
  reason: z.string().trim().min(1, 'กรอกเหตุผลของเอกสาร').max(1000),
  filePath: z.string().min(1).max(MAX_STORAGE_PATH_LENGTH).nullish(),
})

export type CreditNoteCreateInput = z.infer<typeof creditNoteCreateSchema>
/** รูปที่ผู้เรียกส่งเข้า (ก่อนเติมค่าเริ่มต้น — `noteType` ไม่บังคับ) */
export type CreditNoteCreateRequest = z.input<typeof creditNoteCreateSchema>

export const creditNoteCancelSchema = z.object({
  reason: z.string().min(1).max(1000),
})

export type CreditNoteCancelInput = z.infer<typeof creditNoteCancelSchema>

export const creditNoteListQuerySchema = z.object({
  taxInvoiceId: uuidSchema.optional(),
  status: z.enum(['active', 'cancelled']).optional(),
  noteType: creditNoteTypeSchema.optional(),
})

export type CreditNoteListQuery = z.infer<typeof creditNoteListQuerySchema>
