import { z } from 'zod'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของงาน WHT (ไฟล์ 33) — Rule 13
 *
 * ⚠️ ไม่มี schema สำหรับ "สร้าง/แก้ยอด" ใบ 50 ทวิ โดยเจตนา — ใบเกิดอัตโนมัติจากรอบจ่ายที่
 *    `completed` เท่านั้น (`33` §9) และยอดเป็น snapshot จาก `payout_batch_items` (ไฟล์ 17)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const whtCertificateStatusSchema = z.enum(['active', 'cancelled'])
export const whtFilingFormSchema = z.enum(['PND3', 'PND53'])

export const whtCertificateListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  status: whtCertificateStatusSchema.optional(),
  filingForm: whtFilingFormSchema.optional(),
})

export type WhtCertificateListQuery = z.infer<typeof whtCertificateListQuerySchema>

/**
 * ยกเลิกหนังสือรับรอง (`33` §14) — เหตุผลบังคับ (`WHT_CANCEL_REQUIRES_REASON` ตรวจซ้ำที่ service
 * เพื่อให้ได้ code ตามสเปคแม้ผู้เรียกข้าม schema)
 *
 * `reissue` = ออกใบแทนทันทีในทรานแซกชันเดียวกันพร้อมอ้าง `replaces_certificate_id` (`33` §9/§10)
 * — **ค่าเริ่มต้น `false`**: การยกเลิกอย่างเดียวต้องทำให้ยอดของรอบลดลงจริงตามเทสต์ `33` §16
 */
export const whtCancelSchema = z.object({
  reason: z.string().trim().min(1, 'ต้องระบุเหตุผลการยกเลิก').max(1000),
  reissue: z.boolean().optional().default(false),
})

export type WhtCancelInput = z.infer<typeof whtCancelSchema>

/** mark ว่ายื่นแบบแล้ว (`33` §14) — ยื่นจริงนอกระบบ จึงต้องระบุผู้ยืนยัน + เหตุผล/อ้างอิงการยื่น */
export const whtMarkFiledSchema = z.object({
  reason: z.string().trim().min(1, 'ต้องระบุอ้างอิงการยื่น เช่น เลขที่ใบเสร็จ/วันที่ยื่น').max(1000),
})

export type WhtMarkFiledInput = z.infer<typeof whtMarkFiledSchema>

export const whtFilingSummaryListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
})

export type WhtFilingSummaryListQuery = z.infer<typeof whtFilingSummaryListQuerySchema>
