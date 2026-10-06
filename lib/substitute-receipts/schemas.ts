import { z } from 'zod'
import { dateOnlySchema, satangSchema } from '@/lib/api/validation'
import { SUBSTITUTE_RECEIPT_MAX_LINES } from '@/lib/substitute-receipts/substitute-receipt'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของใบรับรองแทนใบเสร็จรับเงิน (มติ PO U103 · Rule 13)
 *
 * ใช้ในฟอร์มเบิกค่าที่พัก (ติ๊ก "ไม่มีใบเสร็จ") และฟอร์มเคลียร์เงินทดรอง — ยอดรวม/เพดานอยู่ที่
 * `substitute-receipt.ts` (pure · `22` §6.17) ที่เดียว ที่นี่ตรวจแค่รูปร่างของ input
 * ⚠️ `lineDate` เป็นคอลัมน์ `DATE` ⇒ `dateOnlySchema()` (เที่ยงคืน UTC)
 */

const optionalNote = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(200, 'หมายเหตุยาวเกิน 200 ตัวอักษร').nullable().default(null),
)

export const substituteReceiptLineSchema = z.object({
  lineDate: dateOnlySchema('วันที่จ่าย'),
  description: z.string().trim().min(3, 'ระบุรายละเอียดรายจ่ายอย่างน้อย 3 ตัวอักษร').max(300, 'รายละเอียดยาวเกินไป'),
  amountSatang: satangSchema('จำนวนเงิน').refine((value) => value > 0, 'จำนวนเงินต้องมากกว่า 0'),
  /** ผู้รับเงิน/สถานที่ (ถ้ามี) */
  note: optionalNote,
})

/** รายการบรรทัดของใบที่จะออก — ยอดรวมของใบ = ผลรวมบรรทัด (server คำนวณเอง ไม่รับยอดรวมจากหน้าจอ) */
export const substituteReceiptDraftSchema = z.object({
  lines: z
    .array(substituteReceiptLineSchema)
    .min(1, 'ต้องมีรายจ่ายอย่างน้อย 1 รายการ')
    .max(SUBSTITUTE_RECEIPT_MAX_LINES, `รายการได้ไม่เกิน ${SUBSTITUTE_RECEIPT_MAX_LINES} บรรทัดต่อใบ`),
})

/** `POST /api/substitute-receipts/:id/signed` — path ของไฟล์ฉบับเซ็นจากกลไกอัปโหลดผ่าน server */
export const substituteReceiptSignedSchema = z.object({
  signedFilePath: z.string().trim().min(1, 'แนบไฟล์ใบรับรองฉบับเซ็นแล้ว').max(1024, 'path ของไฟล์ยาวเกินไป'),
})

export type SubstituteReceiptLineInput = z.infer<typeof substituteReceiptLineSchema>
export type SubstituteReceiptDraftInput = z.infer<typeof substituteReceiptDraftSchema>
export type SubstituteReceiptSignedInput = z.infer<typeof substituteReceiptSignedSchema>
