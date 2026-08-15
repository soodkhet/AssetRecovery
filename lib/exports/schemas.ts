import { z } from 'zod'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของงานส่งมอบชุดบัญชี (ไฟล์ 37 §14) — Rule 13
 *
 * ⚠️ ไม่มี schema สำหรับ "แก้ไข/ลบ" ประวัติการส่งมอบโดยเจตนา — `export_records` เก่า **ห้ามลบ**
 *    เก็บเป็น audit trail ทุกเวอร์ชัน (`37` §10 · `02` §13)
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const exportHistoryListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
})

export type ExportHistoryListQuery = z.infer<typeof exportHistoryListQuerySchema>

/** สร้างชุดใหม่ของรอบ (`37` §14) — ระบุแค่รอบบัญชี ที่เหลือระบบประกอบเองทั้งหมด */
export const exportPackSchema = z.object({
  periodId: uuidSchema,
  /** บันทึกลง audit — ไม่บังคับ (`export_records` ไม่ใช่ตารางอ่อนไหวตามนโยบาย reason กลาง) */
  note: z.string().trim().max(1000).optional(),
})

export type ExportPackInput = z.infer<typeof exportPackSchema>

/** mark ว่าส่งให้สำนักงานบัญชีแล้ว / ตอบรับแล้ว (`37` §9) — ส่งจริงนอกระบบ จึงบันทึกได้แค่บันทึกช่วยจำ */
export const exportStatusSchema = z.object({
  note: z.string().trim().max(1000).optional(),
})

export type ExportStatusInput = z.infer<typeof exportStatusSchema>
