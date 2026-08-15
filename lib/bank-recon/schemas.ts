import { z } from 'zod'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของกระทบยอดธนาคาร (ไฟล์ 35 §14) — Rule 13
 *
 * ⚠️ `matchNote` ที่นี่ตรวจแค่รูปแบบ — **การบังคับกรอก** ตัดสินด้วย `manualMatchRequiresNote()`
 *    (pure) เพื่อให้ผู้ใช้ได้ code `MATCH_NOTE_REQUIRED` ตรงตาม `35` §11 ไม่ใช่ field error ทั่วไป
 *    ยกเว้น `resolve-unmatched` ที่ note บังคับเสมอทุกกรณี (`35` §10) จึงบังคับที่ schema ได้เลย
 */

const uuidSchema = z.string().uuid('รูปแบบรหัสไม่ถูกต้อง')

export const bankMatchStatusSchema = z.enum(['unmatched', 'auto_matched', 'manual_matched', 'unmatched_resolved'])

export const bankTransactionListQuerySchema = z.object({
  periodId: uuidSchema.optional(),
  bankAccountId: uuidSchema.optional(),
  status: bankMatchStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

/** ขนาดไฟล์ statement — 2 MB ครอบคลุม statement รายเดือนของธนาคารไทยทุกเจ้าอย่างเหลือเฟือ */
const MAX_STATEMENT_CHARS = 2_000_000

export const statementImportSchema = z.object({
  bankAccountId: uuidSchema,
  /** เนื้อไฟล์ CSV เป็นข้อความ (FE อ่านด้วย `FileReader.readAsText`) */
  csv: z.string().min(1, 'ต้องแนบไฟล์ statement').max(MAX_STATEMENT_CHARS, 'ไฟล์ใหญ่เกินกำหนด (2 MB)'),
  fileName: z.string().trim().min(1).max(255),
})

export const matchTargetKindSchema = z.enum(['billing', 'payout'])

export const bankMatchSchema = z.object({
  targetKind: matchTargetKindSchema,
  targetId: uuidSchema,
  matchNote: z.string().trim().max(1000).nullable().default(null),
  /** ยืนยันเปลี่ยนการจับคู่เดิมหลังเห็น `ALREADY_MATCHED` (`35` §11 — เตือนก่อนเสมอ) */
  confirmRematch: z.boolean().default(false),
})

export const resolveUnmatchedSchema = z.object({
  /** บังคับเสมอ (`35` §10) — "ไม่ปล่อยผ่านเงียบ ๆ" */
  matchNote: z.string().trim().min(1, 'ต้องระบุเหตุผลที่ปิดรายการโดยไม่จับคู่').max(1000),
})

export const matchCandidateQuerySchema = z.object({
  transactionId: uuidSchema,
  /** คำค้นจาก dropdown (`35` §8) — เลขที่รอบ/ชื่อบริษัท */
  q: z.string().trim().max(100).optional(),
})

export type BankTransactionListQuery = z.infer<typeof bankTransactionListQuerySchema>
export type StatementImportInput = z.infer<typeof statementImportSchema>
export type BankMatchInput = z.infer<typeof bankMatchSchema>
export type ResolveUnmatchedInput = z.infer<typeof resolveUnmatchedSchema>
export type MatchCandidateQuery = z.infer<typeof matchCandidateQuerySchema>
