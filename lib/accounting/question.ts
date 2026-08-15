import { AccountingError } from '@/lib/accounting/errors'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ข้อซักถามจากสำนักงานบัญชี (ไฟล์ 36) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### กติกาที่ห้ามหลุด
 * - **สถานะเก็บเป็น `is_resolved BOOLEAN`** (`02` §9 · `36` §6.1 v2) — `false` = `open`,
 *   `true` = `answered` · **ห้ามสร้าง enum ใหม่** (Rule 04) ⇒ แปลงเป็นป้ายที่นี่ที่เดียว
 * - **ตอบแล้วตอบซ้ำไม่ได้** — `answered` เป็นปลายทาง (`36` §8) ⇒ `ACCOUNTANT_QUESTION_ALREADY_ANSWERED`
 * - เป็น log การสื่อสาร **ไม่ใช่รายการเงิน** ⇒ ไม่บังคับ `reason` (`36` §12) — audit ปกติพอ
 *
 * ### สิ่งที่ยังไม่มีในสคีมา (`02` ชนะไฟล์ 36 ตามลำดับเอกสารขัดกัน — ดู `02_OPEN_DECISIONS` D14)
 * `accountant_questions` ของ `02` §9 **ไม่มีคอลัมน์** `reference` และ `due_date` ที่ `36` §6.1
 * ระบุไว้ ⇒ เก็บทั้งสองอย่างไว้ใน `question_text` ไม่ได้แบบมีโครงสร้าง จึง**ยังไม่ implement**
 * — กำหนดเวลาตอบจึงใช้ "เกินกำหนดหรือยัง" ไม่ได้ · จอแสดงเฉพาะข้อมูลที่มีคอลัมน์จริง
 */

/** บันทึก/ตอบข้อซักถาม = บัญชีเท่านั้น (`25` §7.5 · `36` §11) */
export const MANAGE_ACCOUNTANT_QUESTIONS = 'manage_accountant_questions'

/** ผู้ที่เปิดดูได้ — บัญชี manage · การเงินอ่านอย่างเดียว (`36` §11) */
export const QUESTION_READ_CAPABILITIES = [MANAGE_ACCOUNTANT_QUESTIONS] as const

export type QuestionStatus = 'open' | 'answered'

/** `is_resolved` → สถานะที่เอกสารใช้เรียก (`36` §6.1) */
export function questionStatusOf(isResolved: boolean): QuestionStatus {
  return isResolved ? 'answered' : 'open'
}

export const QUESTION_STATUS_LABEL: Readonly<Record<QuestionStatus, string>> = {
  open: 'รอตอบ',
  answered: 'ตอบแล้ว',
}

/** สีจาก mapper กลาง (`04` §8.1): `open` = แดง (ค้างตอบ) · `answered` = ฟ้าอมเขียว */
export const QUESTION_STATUS_GROUP: Readonly<Record<QuestionStatus, StatusBadgeGroup>> = {
  open: 'critical',
  answered: 'partial',
}

export function questionStatusLabel(isResolved: boolean): string {
  return QUESTION_STATUS_LABEL[questionStatusOf(isResolved)]
}

/** ตอบได้ครั้งเดียว — ตอบซ้ำ/แก้คำตอบเดิมต้องเป็นคำถามใหม่ (`36` §8) */
export function assertAnswerable(isResolved: boolean, questionId: string): void {
  if (isResolved) {
    throw new AccountingError('ACCOUNTANT_QUESTION_ALREADY_ANSWERED', { detail: `question=${questionId}` })
  }
}

export interface QuestionCountInput {
  isResolved: boolean
}

export interface QuestionSummary {
  total: number
  open: number
  answered: number
}

export function summarizeQuestions(rows: readonly QuestionCountInput[]): QuestionSummary {
  const answered = rows.filter((row) => row.isResolved).length
  return { total: rows.length, open: rows.length - answered, answered }
}
