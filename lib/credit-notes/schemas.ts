import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'
import { MAX_STORAGE_PATH_LENGTH } from '@/lib/uploads/targets'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของใบลดหนี้ (มติ PO 05/10/2569 U14) — Rule 13
 *
 * ⚠️ ไม่มี field `totalSatang` / `vatRateUsed` — ยอดรวมคิดที่ server และอัตรา snapshot จากใบกำกับเดิมเสมอ
 * ⚠️ `vatSatang` ไม่ส่ง = ใช้ค่าที่คำนวณจากอัตราเดิม · ส่งมา = ยอดตามเอกสาร (ตรวจ ±1 สตางค์ที่ service)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const creditNoteCreateSchema = z.object({
  taxInvoiceId: uuidSchema,
  adjustmentId: uuidSchema.nullish(),
  creditNoteNumber: z.string().trim().min(1, 'กรอกเลขที่ใบลดหนี้').max(50, 'เลขที่ยาวเกิน 50 ตัวอักษร'),
  issueDate: dateOnlySchema('วันที่ออกใบลดหนี้'),
  amountBeforeVatSatang: z.number().int('ยอดต้องเป็นสตางค์จำนวนเต็ม').positive('มูลค่าที่ลดต้องมากกว่า 0'),
  vatSatang: z.number().int('ยอดต้องเป็นสตางค์จำนวนเต็ม').nonnegative('ภาษีติดลบไม่ได้').nullish(),
  // กระทบเงิน/ภาษี ⇒ เหตุผลบังคับ (Rule 03)
  reason: z.string().trim().min(1, 'กรอกเหตุผลของใบลดหนี้').max(1000),
  filePath: z.string().min(1).max(MAX_STORAGE_PATH_LENGTH).nullish(),
})

export type CreditNoteCreateInput = z.infer<typeof creditNoteCreateSchema>

export const creditNoteCancelSchema = z.object({
  reason: z.string().min(1).max(1000),
})

export type CreditNoteCancelInput = z.infer<typeof creditNoteCancelSchema>

export const creditNoteListQuerySchema = z.object({
  taxInvoiceId: uuidSchema.optional(),
  status: z.enum(['active', 'cancelled']).optional(),
})

export type CreditNoteListQuery = z.infer<typeof creditNoteListQuerySchema>
