import type { BankAccountUsage, BankFilePurpose } from '@/lib/generated/prisma/enums'

/**
 * บัญชีธนาคารบริษัท (`13` §6.3) — **pure ล้วน**
 *
 * ⚠️ `is_payout_account` ถูก **deprecate** (DEC-006/D2 — ความหมายซ้ำกับ `usage`)
 * ห้ามอ่าน/เขียนคอลัมน์นั้นในโค้ดใหม่ ทุกจุดที่ถามว่า "บัญชีนี้จ่ายเงินได้ไหม" ให้ใช้
 * `canPayFrom()` / `canReceiveTo()` ที่ตัดสินจาก `usage` เท่านั้น
 */

export interface BankAccountValues {
  bankName: string
  accountName: string
  accountNumber: string
  accountType: 'savings' | 'current'
  usage: BankAccountUsage
  /** `bank_file_formats.id` ชนิด statement (มติ PO U147) */
  statementFormatId: string | null
  /** `bank_file_formats.id` ชนิด payment (มติ PO U147) */
  paymentFileFormatId: string | null
  autoMatchToleranceDays: number
  isPrimary: boolean
}

export const ACCOUNT_TYPE_VALUES = ['savings', 'current'] as const
export const MAX_AUTO_MATCH_TOLERANCE_DAYS = 90
/** ค่าเริ่มต้นแนะนำของ auto-matching ใน Bank Reconciliation (`13` §6.3 · ไฟล์ 35) */
export const DEFAULT_AUTO_MATCH_TOLERANCE_DAYS = 7

/** เลขบัญชีเก็บเป็นตัวเลขล้วน — ตัด `-`/ช่องว่างทิ้ง เพื่อให้ UNIQUE จับซ้ำได้จริง */
export function normalizeAccountNumber(accountNumber: string): string {
  return accountNumber.replace(/[\s-]/g, '')
}

export function normalizeBankAccountValues(input: BankAccountValues): BankAccountValues {
  const trimOrNull = (value: string | null): string | null => {
    const trimmed = value?.trim() ?? ''
    return trimmed === '' ? null : trimmed
  }
  return {
    bankName: input.bankName.trim(),
    accountName: input.accountName.trim(),
    accountNumber: normalizeAccountNumber(input.accountNumber),
    accountType: input.accountType,
    usage: input.usage,
    statementFormatId: trimOrNull(input.statementFormatId),
    paymentFileFormatId: trimOrNull(input.paymentFileFormatId),
    autoMatchToleranceDays: input.autoMatchToleranceDays,
    isPrimary: input.isPrimary,
  }
}

/** จ่ายออกจากบัญชีนี้ได้ไหม (ไฟล์ 17 เลือกบัญชีต้นทางของรอบจ่าย) */
export function canPayFrom(usage: BankAccountUsage): boolean {
  return usage === 'pay' || usage === 'both'
}

/** รับเงินเข้าบัญชีนี้ได้ไหม (ไฟล์ 31/35 จับคู่เงินเข้า) */
export function canReceiveTo(usage: BankAccountUsage): boolean {
  return usage === 'receive' || usage === 'both'
}

export const BANK_ACCOUNT_USAGE_LABEL: Readonly<Record<BankAccountUsage, string>> = {
  receive: 'รับเข้าอย่างเดียว',
  pay: 'จ่ายออกอย่างเดียว',
  both: 'รับและจ่าย',
}

/** ปิดบังเลขบัญชีตอนแสดงผลรวม ๆ (`90` §6.2 — ข้อมูลธนาคารเป็นข้อมูลอ่อนไหว) */
export function maskAccountNumber(accountNumber: string): string {
  const digits = normalizeAccountNumber(accountNumber)
  if (digits.length <= 4) return digits
  return `${'x'.repeat(digits.length - 4)}${digits.slice(-4)}`
}

/** payload ที่ลง audit — เลขบัญชีเต็มเก็บได้ (audit เป็นข้อมูลควบคุม อ่านได้เฉพาะ Superadmin) */
export function toBankAccountAuditPayload(values: BankAccountValues): Record<string, unknown> {
  return {
    bank_name: values.bankName,
    account_name: values.accountName,
    account_number: values.accountNumber,
    account_type: values.accountType,
    usage: values.usage,
    statement_format_id: values.statementFormatId,
    payment_file_format_id: values.paymentFileFormatId,
    auto_match_tolerance_days: values.autoMatchToleranceDays,
    is_primary: values.isPrimary,
  }
}

// ── ผูกบัญชีกับรูปแบบไฟล์ธนาคาร (Final Test ด่าน 5 → มติ PO U147) ───────────
// บัญชีอ้างรูปแบบด้วย **id** และชนิดต้องตรงช่อง (statement / ไฟล์โอน) — ตัวนำเข้า statement และหน้าสร้างไฟล์โอนอ่านตาม id

export interface BankFileFormatRef {
  id: string
  purpose: BankFilePurpose
  label: string
  usable: boolean
  isActive?: boolean
}

/** ตัวเลือกรูปแบบของช่องหนึ่ง (เฉพาะชนิดนั้น ที่ยังใช้งาน) — ค่าปัจจุบันที่ไม่อยู่ในรายการแล้วยังแสดงไว้ (`missing`) ไม่หายเงียบ */
export function bankFileFormatOptions(
  formats: readonly BankFileFormatRef[],
  purpose: BankFilePurpose,
  currentId: string | null,
): { value: string; label: string; missing: boolean }[] {
  const options = formats
    .filter((format) => format.purpose === purpose && format.isActive !== false)
    .map((format) => ({ value: format.id, label: format.label, missing: false }))
  if (currentId !== null && currentId !== '' && !options.some((option) => option.value === currentId)) {
    options.unshift({ value: currentId, label: 'รูปแบบที่ถูกปิดใช้งาน/ไม่ตรงชนิด — เลือกใหม่', missing: true })
  }
  return options
}

/**
 * รูปแบบไฟล์โอนที่เลือกให้ก่อนตอนสร้างไฟล์โอนเงิน — รูปแบบไฟล์โอนที่ "ใช้ได้" (ทดสอบผ่าน) และตรงกับ
 * `payment_file_format_id` ของบัญชีต้นทาง · ไม่ได้ตั้ง/ใช้ไม่ได้ ⇒ รูปแบบไฟล์โอนที่ใช้ได้ตัวแรก · ไม่มีเลย ⇒ `''`
 */
export function defaultPaymentFileFormatId(
  formats: readonly BankFileFormatRef[],
  paymentFileFormatId: string | null | undefined,
): string {
  const usable = formats.filter((format) => format.usable && format.purpose === 'payment')
  const matched = usable.find((format) => format.id === paymentFileFormatId)
  return (matched ?? usable[0])?.id ?? ''
}
