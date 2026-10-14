import { fmtSatangSymbol } from '@/lib/format/money'
import {
  substituteDraftPayload,
  substituteDraftTotalSatang,
  substituteLineAtFromFields,
  type SubstituteDraftPayload,
  type SubstituteLineDraft,
  type SubstituteLineIssueAt,
} from '@/lib/substitute-receipts/form'

/**
 * ผลตรวจฟอร์ม "เคลียร์เงินทดรองจ่าย" — **pure** (ตรวจซ้ำ staging SV5-J1-02/SV5-J1-03)
 * · ข้อผิดทุกข้อผูกกับช่องจริงบนจอ (ใต้ช่อง + aria-invalid) และข้อแรกตามลำดับบนจอขึ้น footer ติดจอ
 * · "ยอดรวมรายการเกินยอดใช้จริง" ผูกกับช่องยอดที่ใช้จริง (ช่องเดียวที่ชี้ได้แน่นอน — รายการมีหลายแถว)
 * ⚠️ UX guard เท่านั้น — server ตรวจซ้ำทุกข้อด้วย `advanceSettleSchema`
 */

/** ลำดับช่องบนจอจากบนลงล่าง — ยอดที่ใช้จริง → วิธีคืน → ใบเสร็จ → ตารางไม่มีใบเสร็จ → หมายเหตุ */
export const SETTLE_FORM_FIELDS = ['usedSatang', 'returnMethod', 'receiptFileUrl', 'substituteReceipt', 'note'] as const
export type SettleFormField = (typeof SETTLE_FORM_FIELDS)[number]

export const SETTLE_RECEIPT_REQUIRED_MESSAGE = 'ต้องแนบใบเสร็จ หรือติ๊ก "ไม่มีใบเสร็จ" แล้วกรอกรายการ'

export function settleLinesOverUsedMessage(linesTotalSatang: number | null, usedSatang: number | null): string {
  if (linesTotalSatang === null || usedSatang === null) return 'ยอดรวมรายการที่ไม่มีใบเสร็จต้องไม่เกินยอดที่ใช้จริง'
  return `ยอดรวมรายการที่ไม่มีใบเสร็จ (${fmtSatangSymbol(linesTotalSatang)}) ต้องไม่เกินยอดที่ใช้จริง (${fmtSatangSymbol(usedSatang)})`
}

export interface SettleFormIssues {
  /** ข้อความใต้ช่อง (ไม่รวมตารางรายการ) */
  errors: Partial<Record<Exclude<SettleFormField, 'substituteReceipt'>, string>>
  /** ข้อผิดของตารางรายการ — `at` = แถว+ช่อง (null = ระดับทั้งตาราง) */
  lines: { message: string; at: SubstituteLineIssueAt | null } | null
  /** ข้อแรกตามลำดับบนจอ — แสดงที่ footer */
  first: { field: SettleFormField; message: string } | null
}

function withFirst(errors: SettleFormIssues['errors'], lines: SettleFormIssues['lines']): SettleFormIssues {
  for (const field of SETTLE_FORM_FIELDS) {
    if (field === 'substituteReceipt') {
      if (lines !== null) return { errors, lines, first: { field, message: lines.message } }
      continue
    }
    const message = errors[field]
    if (message !== undefined) return { errors, lines, first: { field, message } }
  }
  return { errors, lines, first: null }
}

/**
 * ตรวจก่อนอัปโหลด/ส่ง — ตรวจทุกข้อพร้อมกัน (เดิมตรวจตารางแล้ว return ก่อน) แล้วคืนข้อแรกตามลำดับบนจอ
 * · `payload` = รายการที่พร้อมส่ง (null เมื่อไม่ได้ติ๊ก "ไม่มีใบเสร็จ" หรือยังมีข้อผิด)
 */
export function settleFormIssues(input: {
  usedSatang: number
  hasReceipt: boolean
  noReceipt: boolean
  lines: readonly SubstituteLineDraft[]
}): SettleFormIssues & { payload: SubstituteDraftPayload | null } {
  const errors: SettleFormIssues['errors'] = {}
  let lines: SettleFormIssues['lines'] = null
  let payload: SubstituteDraftPayload | null = null
  if (input.noReceipt) {
    const draft = substituteDraftPayload(input.lines)
    if (draft.error !== null) {
      lines = { message: draft.error, at: draft.at }
    } else {
      const total = substituteDraftTotalSatang(input.lines)
      if (total > input.usedSatang) errors.usedSatang = settleLinesOverUsedMessage(total, input.usedSatang)
      else payload = draft.payload
    }
  }
  if (input.usedSatang > 0 && !input.hasReceipt && !input.noReceipt) {
    errors.receiptFileUrl = SETTLE_RECEIPT_REQUIRED_MESSAGE
  }
  const issues = withFirst(errors, lines)
  return { ...issues, payload: issues.first === null ? payload : null }
}

/**
 * ข้อผิดจาก API (`fields` ของ error — path แบบ `usedSatang`, `substituteReceipt.lines.0.amountSatang`) → ช่องบนจอ
 * · `substituteReceipt` (ยอดรวมเกิน) ⇒ ช่องยอดที่ใช้จริง แบบเดียวกับฝั่งหน้าจอ · key อื่นที่ไม่รู้จัก ⇒ ไม่ผูกช่อง
 * (ข้อความเต็มยังขึ้น footer จาก `message` ของ error เสมอ)
 */
export function settleApiIssues(
  fields: Readonly<Record<string, string>> | undefined,
  drafts: readonly SubstituteLineDraft[],
): SettleFormIssues {
  const errors: SettleFormIssues['errors'] = {}
  let lines: SettleFormIssues['lines'] = null
  const lineFields: Record<string, string> = {}
  for (const [path, message] of Object.entries(fields ?? {})) {
    if (path === 'usedSatang' || path === 'returnMethod' || path === 'receiptFileUrl' || path === 'note') {
      errors[path] ??= message
    } else if (path === 'substituteReceipt') {
      errors.usedSatang ??= message
    } else if (path.startsWith('substituteReceipt.')) {
      const rest = path.slice('substituteReceipt.'.length)
      if (/^lines\.\d+\.\w+$/.test(rest)) lineFields[rest] = message
      else lines ??= { message, at: null }
    }
  }
  const row = substituteLineAtFromFields(lineFields, drafts)
  if (row !== null) {
    const { message, ...at } = row
    lines = { message, at }
  }
  return withFirst(errors, lines)
}
