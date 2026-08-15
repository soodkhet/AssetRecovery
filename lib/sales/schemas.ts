import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของบัญชีขาย/ใบกำกับภาษี/เงินรับ (ไฟล์ 31) — Rule 13
 *
 * ⚠️ **ไม่มี field `invoiceNumber`** ในฟอร์มออกใบกำกับภาษี — เลขที่เดินโดยระบบเท่านั้น (`31` §10)
 * ⚠️ **ไม่มี schema สร้าง Cash Receipt** — เงินรับเกิดจากการกระทบยอด (ไฟล์ 35) เท่านั้น (`31` §6.3)
 * ⚠️ `cancelReason` ที่นี่ตรวจแค่ "เป็นสตริง" — บังคับ min ด้วย `requireCancelReason()` (pure)
 *    เพื่อให้ผู้ใช้ได้ code `CANCEL_REQUIRES_REASON` ตรงตาม `31` §11 ไม่ใช่ field error ทั่วไป
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const salesListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  companyId: uuidSchema.optional(),
  /** `issued` = ออกใบกำกับภาษีแล้ว · `awaiting` = ยังไม่ออก */
  invoiceState: z.enum(['issued', 'awaiting']).optional(),
})

export type SalesListQuery = z.infer<typeof salesListQuerySchema>

export const taxInvoiceListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  companyId: uuidSchema.optional(),
  status: z.enum(['active', 'cancelled']).optional(),
})

export type TaxInvoiceListQuery = z.infer<typeof taxInvoiceListQuerySchema>

/**
 * ออกใบกำกับภาษี (`31` §14 `POST /api/accounting/tax-invoices`) — สร้าง = ออกทันที ไม่มีขั้นร่าง
 * `invoiceDate` ไม่ส่งมา = วันนี้ (เวลาไทย) · คอลัมน์ `DATE` ⇒ ใช้ `dateOnlySchema()` (เที่ยงคืน UTC)
 */
export const taxInvoiceCreateSchema = z.object({
  salesRecordId: uuidSchema,
  invoiceDate: dateOnlySchema('วันที่ออกใบกำกับภาษี').optional(),
})

export type TaxInvoiceCreateInput = z.infer<typeof taxInvoiceCreateSchema>

export const taxInvoiceCancelSchema = z.object({
  reason: z.string().max(1000),
})

export type TaxInvoiceCancelInput = z.infer<typeof taxInvoiceCancelSchema>

export const cashReceiptListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  companyId: uuidSchema.optional(),
})

export type CashReceiptListQuery = z.infer<typeof cashReceiptListQuerySchema>
