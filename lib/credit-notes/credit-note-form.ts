import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * ตรวจฟอร์ม "บันทึกใบลด/เพิ่มหนี้" ฝั่งหน้าจอ + ผูกข้อผิดจาก API กับช่อง (mytester6 T-022) — pure
 * เพดานที่ฟอร์มรู้อยู่แล้ว (`creditNoteFormLimit()`) ตรวจก่อนส่ง · server ตรวจซ้ำเสมอ (ข้อความนี้เป็นแค่ UX)
 */

/** คีย์ช่องในฟอร์ม (ใช้กับ `useSubmitError().fields`) */
export type CreditNoteFormField = 'number' | 'date' | 'amount' | 'vat' | 'reason'

/**
 * ใบลดหนี้: มูลค่าก่อนภาษีเกินเพดานก่อนภาษี หรือ ยอดรวม (ก่อนภาษี + ภาษีที่กรอก/ที่ระบบเสนอ) เกินเพดานรวมภาษี ⇒ ข้อความ
 * · ใบเพิ่มหนี้ / ยังไม่มียอด / ไม่มีเพดาน ⇒ `null` · ไม่ทราบภาษี (เว้นว่างและระบบไม่ได้เสนอ) ⇒ ตรวจเฉพาะก่อนภาษี
 */
export function creditNoteAmountLimitIssue(input: {
  isDebit: boolean
  amountSatang: number | null
  /** ภาษีที่กรอก · เว้นว่าง = ภาษีที่ระบบเสนอ (ถ้ามี) · `null` = ไม่ทราบ */
  vatSatang: number | null
  maxBeforeVatSatang: number | null
  maxTotalSatang: number | null
}): string | null {
  if (input.isDebit || input.amountSatang === null || input.amountSatang <= 0) return null
  if (input.maxBeforeVatSatang !== null && input.amountSatang > input.maxBeforeVatSatang) {
    return `มูลค่าที่ลดเกินเพดาน — ลดได้ไม่เกิน ${fmtSatangSymbol(input.maxBeforeVatSatang)} (ก่อนภาษี)`
  }
  if (input.maxTotalSatang !== null && input.vatSatang !== null && input.amountSatang + input.vatSatang > input.maxTotalSatang) {
    return `ยอดใบลดหนี้รวมภาษี ${fmtSatangSymbol(input.amountSatang + input.vatSatang)} เกินเพดาน — ลดได้ไม่เกิน ${fmtSatangSymbol(input.maxTotalSatang)} (รวมภาษี)`
  }
  return null
}

/** code จาก API ที่ชี้ช่องเดียวชัดเจน (code เดิมจาก `24` — ไม่สร้างใหม่) */
const CODE_FIELD: Readonly<Record<string, CreditNoteFormField>> = {
  CREDIT_NOTE_EXCEEDS_INVOICE: 'amount',
  CREDIT_NOTE_EXCEEDS_OUTSTANDING: 'amount',
  CREDIT_NOTE_VAT_MISMATCH: 'vat',
  CREDIT_NOTE_NUMBER_DUPLICATE: 'number',
  CREDIT_NOTE_DATE_BEFORE_INVOICE: 'date',
  PERIOD_LOCKED_DIRECT_EDIT: 'date',
}

/** path ของ Zod (`creditNoteCreateSchema`) → ช่องในฟอร์ม */
const PATH_FIELD: Readonly<Record<string, CreditNoteFormField>> = {
  creditNoteNumber: 'number',
  issueDate: 'date',
  amountBeforeVatSatang: 'amount',
  vatSatang: 'vat',
  reason: 'reason',
}

/** ข้อผิดจาก API ⇒ ข้อความใต้ช่อง (`fields` จาก Zod ก่อน · ไม่มี ⇒ ตาม code) · ไม่รู้ช่อง ⇒ `{}` (footer อย่างเดียว) */
export function creditNoteApiFieldErrors(error: {
  code?: string
  message: string
  fields?: Readonly<Record<string, string>>
}): Partial<Record<CreditNoteFormField, string>> {
  const mapped: Partial<Record<CreditNoteFormField, string>> = {}
  for (const [path, text] of Object.entries(error.fields ?? {})) {
    const field = PATH_FIELD[path]
    if (field !== undefined && mapped[field] === undefined) mapped[field] = text
  }
  if (Object.keys(mapped).length > 0) return mapped
  const byCode = error.code === undefined ? undefined : CODE_FIELD[error.code]
  return byCode === undefined ? {} : { [byCode]: error.message }
}
