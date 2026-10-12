/**
 * รูปแบบเลขบัญชีธนาคาร — กติกาเดียวของทั้งระบบ (บัญชีบริษัท `13` §6.3 · บัญชีผู้รับเงิน `18` §7.1/§11)
 *
 * ตรวจ "ต้องเป็นตัวเลข" **ก่อน** ความยาว (mytester A-03: กรอก "abc-12" ต้องบอกว่าต้องเป็นตัวเลข
 * ไม่ใช่ "สั้นเกินไป") · นับความยาวจากตัวเลขล้วน ไม่นับขีด/ช่องว่างคั่น · mytester3 A3-01: ผู้รับเงินใช้กติกาเดียวกัน
 */

export const BANK_ACCOUNT_NUMBER_MIN_DIGITS = 8
export const BANK_ACCOUNT_NUMBER_MAX_LENGTH = 30

export const BANK_ACCOUNT_NUMBER_MESSAGES = {
  notDigits: 'เลขบัญชีต้องเป็นตัวเลข (มี - หรือช่องว่างคั่นได้)',
  tooShort: `เลขบัญชีต้องมีตัวเลขอย่างน้อย ${BANK_ACCOUNT_NUMBER_MIN_DIGITS} หลัก`,
  tooLong: 'เลขบัญชียาวเกินไป',
} as const

/** ข้อความบอกปัญหาของเลขบัญชี (trim แล้ว ไม่ว่าง) — `null` = รูปแบบถูกต้อง */
export function bankAccountNumberProblem(value: string): string | null {
  const trimmed = value.trim()
  if (!/^[\d\s-]+$/.test(trimmed)) return BANK_ACCOUNT_NUMBER_MESSAGES.notDigits
  if (trimmed.replace(/\D/g, '').length < BANK_ACCOUNT_NUMBER_MIN_DIGITS) return BANK_ACCOUNT_NUMBER_MESSAGES.tooShort
  if (trimmed.length > BANK_ACCOUNT_NUMBER_MAX_LENGTH) return BANK_ACCOUNT_NUMBER_MESSAGES.tooLong
  return null
}
