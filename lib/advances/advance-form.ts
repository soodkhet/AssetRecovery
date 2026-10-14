/**
 * ลำดับช่องบนฟอร์ม "ขอเบิกเงินทดรองจ่าย" จากบนลงล่าง — ผู้รับเงิน (ขอแทน) → ยอดเงิน → วัตถุประสงค์
 * → อ้างอิงเคส → กำหนดเคลียร์ยอด · ตรวจซ้ำ staging SV5-R8-01
 */
export const ADVANCE_FORM_FIELDS = ['payeeId', 'requestedSatang', 'purpose', 'caseId', 'dueClearDate'] as const

export const ADVANCE_PAYEE_REQUIRED_MESSAGE = 'เลือกผู้รับเงินที่ขอแทน'

export interface AdvanceFormIssue {
  /** key ของช่อง (ตรงกับ key ใน `errors` ของฟอร์ม) */
  field: string
  message: string
}

/**
 * รวมผลตรวจของฟอร์มขอเงินทดรอง — `schemaErrors` จาก `advanceCreateSchema` (`toFieldErrors`) + "ต้องเลือกผู้รับ"
 * (ผู้ที่ขอให้ตัวเองไม่ได้) แล้วคืนข้อผิดทุกช่อง + ข้อแรกตามลำดับบนจอ (ไม่ใช่ลำดับที่ schema ตรวจ)
 * ⚠️ UX guard เท่านั้น — server ตรวจซ้ำทุกข้อ
 */
export function advanceFormIssues(input: {
  schemaErrors: Readonly<Record<string, string>>
  needsPayee: boolean
}): { errors: Record<string, string>; first: AdvanceFormIssue | null } {
  const errors: Record<string, string> = { ...input.schemaErrors }
  if (input.needsPayee && errors.payeeId === undefined) errors.payeeId = ADVANCE_PAYEE_REQUIRED_MESSAGE

  const order: readonly string[] = ADVANCE_FORM_FIELDS
  const keys = Object.keys(errors).sort((a, b) => rank(order, a) - rank(order, b))
  const firstKey = keys[0]
  if (firstKey === undefined) return { errors, first: null }
  return { errors, first: { field: firstKey, message: errors[firstKey] ?? '' } }
}

/** ช่องที่ไม่อยู่ในลำดับ (เช่น `_` ของทั้งฟอร์ม) ไปท้ายสุด */
function rank(order: readonly string[], key: string): number {
  const index = order.indexOf(key)
  return index === -1 ? order.length : index
}
