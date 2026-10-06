import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของบัญชีขาย/ใบกำกับภาษี/เงินรับ (ไฟล์ 31) — Rule 13
 *
 * ⚠️ **ไม่มี field `invoiceNumber`/ยอดเงิน** ในฟอร์มออกเอกสารภาษี — เลขที่เดินโดยระบบ ยอดคิดจากเงินรับ (`31` §10)
 * ⚠️ **ไม่มี schema สร้าง Cash Receipt** — เงินรับเกิดจากการกระทบยอด (ไฟล์ 35) เท่านั้น (`31` §6.3)
 * ⚠️ `cancelReason` ที่นี่ตรวจแค่ "เป็นสตริง" — บังคับ min ด้วย `requireCancelReason()` (pure)
 *    เพื่อให้ผู้ใช้ได้ code `CANCEL_REQUIRES_REASON` ตรงตาม `31` §11 ไม่ใช่ field error ทั่วไป
 */

const uuidSchema = z.string().guid('รูปแบบรหัสไม่ถูกต้อง')

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
 * ออกเอกสารภาษี (`31` §14 `POST /api/accounting/tax-invoices` — มติ PO U95) — สร้าง = ออกทันที ไม่มีขั้นร่าง
 * - `cashReceiptId` = ออก **ใบเสร็จรับเงิน/ใบกำกับภาษี** ของเงินรับนั้น (ยอดตามเงินที่รับ · VAT อัตรา ณ วันรับเงิน)
 *   — มีใบที่ยกเลิกแล้วของเงินรับเดียวกัน ⇒ ใบใหม่เป็น "ใบแทน" อัตโนมัติ (U96 #8)
 * - `replacesInvoiceId` = ออกแทนใบที่ยกเลิกแล้ว (ใช้กับใบกำกับแบบเดิมก่อน U95 — ยอด/อัตราเดิม)
 * ต้องส่งอย่างใดอย่างหนึ่ง · `invoiceDate` ไม่ส่ง = วันรับเงิน (ใบเสร็จฯ) / วันนี้ (ใบแทนแบบเดิม)
 * · คอลัมน์ `DATE` ⇒ `dateOnlySchema()` (เที่ยงคืน UTC)
 */
export const taxInvoiceCreateSchema = z
  .object({
    cashReceiptId: uuidSchema.optional(),
    replacesInvoiceId: uuidSchema.optional(),
    invoiceDate: dateOnlySchema('วันที่เอกสาร').optional(),
  })
  .refine((value) => (value.cashReceiptId === undefined) !== (value.replacesInvoiceId === undefined), {
    message: 'เลือกเงินรับ หรือใบที่ต้องการออกแทน อย่างใดอย่างหนึ่ง',
    path: ['cashReceiptId'],
  })

export type TaxInvoiceCreateInput = z.infer<typeof taxInvoiceCreateSchema>

export const taxInvoiceCancelSchema = z.object({
  // ยกเลิกใบกำกับภาษี = กระทบภาษี ⇒ `reason` บังคับที่ schema ร่วม FE/BE ด้วย ไม่ใช่พึ่ง
  // `requireCancelReason()` ในชั้น service อย่างเดียว (`31` §10 · Rule 03/04 · `CANCEL_REQUIRES_REASON`)
  reason: z.string().min(1).max(1000),
})

export type TaxInvoiceCancelInput = z.infer<typeof taxInvoiceCancelSchema>

export const cashReceiptListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  companyId: uuidSchema.optional(),
})

export type CashReceiptListQuery = z.infer<typeof cashReceiptListQuerySchema>
