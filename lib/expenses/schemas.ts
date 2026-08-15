import { z } from 'zod'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของบัญชีค่าใช้จ่าย (ไฟล์ 32) — Rule 13
 *
 * ⚠️ ยอดเงิน (`gross/wht/net`) **ไม่มีในทุก schema ที่นี่โดยเจตนา** — แก้ยอดตรงต้องถูกปฏิเสธด้วย
 *    `EDIT_AMOUNT_DIRECTLY` (`32` §11) ซึ่งตรวจก่อน parse ด้วย `assertNoAmountEdit()` เพื่อให้ได้
 *    code ตามสเปค ไม่ใช่ field error ทั่วไป
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const documentStatusSchema = z.enum(['complete', 'incomplete'])

export const expenseRecordListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  /** กรองรายการที่เอกสารไม่ครบ (ตัวที่ต้องตามเก็บก่อนปิดงวด — `32` §6.3) */
  documentStatus: documentStatusSchema.optional(),
  /** `true` = เฉพาะรายการที่ยังไม่ได้ map Cost Center */
  unmappedOnly: z
    .union([z.literal('true'), z.literal('false')])
    .transform((value) => value === 'true')
    .optional(),
})

export type ExpenseRecordListQuery = z.infer<typeof expenseRecordListQuerySchema>

/**
 * map Cost Center (`32` §14) — `reason` บังคับ เพราะ `expense_records` อยู่หมวด `money` ของ
 * `reason-policy` (ทุก `update` ต้องมีเหตุผล — Rule 03) · ตรงกับช่อง "หมายเหตุการ Mapping"
 * ของ mockup
 */
export const costCenterMapSchema = z.object({
  costCenterId: uuidSchema,
  reason: z.string().trim().min(1, 'ต้องระบุเหตุผล/หมายเหตุการ mapping').max(1000),
})

export type CostCenterMapInput = z.infer<typeof costCenterMapSchema>
