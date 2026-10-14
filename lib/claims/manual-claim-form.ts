import type { SubstituteLineIssueAt } from '@/lib/substitute-receipts/form'

/**
 * ลำดับช่องบนฟอร์ม "สร้างรายการเบิกด้วยตนเอง" จากบนลงล่าง — ผู้รับเงิน → ประเภท → ยอดเงิน → วันที่เกิดรายการ
 * → หลักฐาน (แนบใบเสร็จ หรือตารางรายการ "ไม่มีใบเสร็จ") → หมายเหตุ · ตรวจซ้ำ staging SV5-R5-01
 */
export const MANUAL_CLAIM_FORM_FIELDS = [
  'payeeId',
  'claimType',
  'grossSatang',
  'expenseDate',
  'receiptFileUrl',
  'substituteReceipt',
  'note',
] as const

export interface ManualClaimFormIssue {
  /** key ของช่อง (ตรงกับ key ใน `errors` ของฟอร์ม) */
  field: string
  message: string
}

/**
 * รวมผลตรวจของฟอร์มสร้างรายการเบิกเอง — `schemaErrors` จาก `claimCreateSchema` (`toFieldErrors`) + ผลตรวจตาราง
 * รายการ "ไม่มีใบเสร็จ" (`substituteDraftPayload()`) แล้วคืนข้อผิดทุกช่อง + ข้อแรกตามลำดับบนจอ (ไม่ใช่ลำดับที่ตรวจ)
 *
 * ไม่มีใบเสร็จและตารางยังผิด ⇒ ตัดข้อผิดที่เป็นผลพลอยได้ของตาราง (ยอดเงินคำนวณจากตาราง / "ต้องแนบใบเสร็จ")
 * ให้เหลือข้อผิดที่ตารางเอง · ⚠️ UX guard เท่านั้น — server ตรวจซ้ำทุกข้อ
 */
export function manualClaimFormIssues(input: {
  schemaErrors: Readonly<Record<string, string>>
  noReceipt: boolean
  linesError: { message: string; at: SubstituteLineIssueAt | null } | null
}): { errors: Record<string, string>; first: ManualClaimFormIssue | null } {
  const errors: Record<string, string> = {}
  for (const [key, message] of Object.entries(input.schemaErrors)) {
    // ข้อผิดย่อยของรายการ (`substituteReceipt.lines.0.…`) แสดงที่ตารางช่องเดียว
    const field = key.startsWith('substituteReceipt.') ? 'substituteReceipt' : key
    if (input.noReceipt && input.linesError !== null && (field === 'grossSatang' || field === 'receiptFileUrl' || field === 'substituteReceipt')) {
      continue
    }
    if (errors[field] === undefined) errors[field] = message
  }
  if (input.noReceipt && input.linesError !== null) errors.substituteReceipt = input.linesError.message

  const order: readonly string[] = MANUAL_CLAIM_FORM_FIELDS
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
