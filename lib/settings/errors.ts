import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดตั้งค่าการเงิน/บัญชี (ไฟล์ 13) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md`
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * code ที่ไฟล์ 24 มีอยู่ก่อนแล้ว: `INVALID_WHT_RATE` (§6.2) · `VAT_RATE_OVERLAP` (§6.2) ·
 * `VAT_RATE_NOT_FOUND` (§6.2) · `BANK_FILE_NOT_TESTED` (§6.3) · `PERIOD_LOCKED_DIRECT_EDIT` (§6.7)
 * ที่เหลือเติมเข้า `24` §6.1–6.3 พร้อม commit นี้ (v3.8)
 */

export const SETTINGS_ERROR_CODES = [
  // §6.1 รอบบิล/รอบจ่าย
  'CYCLE_NOT_FOUND',
  'DUPLICATE_CYCLE_NAME',
  // §6.2 สายอนุมัติ
  'APPROVAL_MATRIX_NOT_FOUND',
  // §6.3 บัญชีธนาคารบริษัท
  'BANK_ACCOUNT_NOT_FOUND',
  'DUPLICATE_BANK_ACCOUNT',
  'BANK_ACCOUNT_IN_USE',
  // §6.4 Tax Profile
  'TAX_PROFILE_NOT_FOUND',
  'DUPLICATE_TAX_PROFILE_NAME',
  'TAX_PROFILE_IN_USE',
  'INVALID_WHT_RATE',
  // §6.5 VAT Rate
  'VAT_RATE_NOT_FOUND',
  'VAT_RATE_OVERLAP',
  // §6.6 Cost Center
  'COST_CENTER_NOT_FOUND',
  'COST_CENTER_IN_USE',
  // §6.8 Bank File Format
  'BANK_FILE_FORMAT_NOT_FOUND',
  'BANK_FILE_NOT_TESTED',
  // §6.12 เลขที่ใบกำกับภาษี
  'NUMBERING_SEQ_NOT_EDITABLE',
  // §6.11 ล็อกรอบบัญชี (โครง — บังคับเต็มรูปแบบ Phase 4.1)
  'PERIOD_LOCKED_DIRECT_EDIT',
] as const

export type SettingsErrorCode = (typeof SETTINGS_ERROR_CODES)[number]

/** 400 = ผิดกติกาข้อมูล/สถานะ · 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามี record นี้ในองค์กรอื่นไหม) */
const HTTP_STATUS: Record<SettingsErrorCode, number> = {
  CYCLE_NOT_FOUND: 404,
  DUPLICATE_CYCLE_NAME: 400,
  APPROVAL_MATRIX_NOT_FOUND: 404,
  BANK_ACCOUNT_NOT_FOUND: 404,
  DUPLICATE_BANK_ACCOUNT: 400,
  BANK_ACCOUNT_IN_USE: 400,
  TAX_PROFILE_NOT_FOUND: 404,
  DUPLICATE_TAX_PROFILE_NAME: 400,
  TAX_PROFILE_IN_USE: 400,
  INVALID_WHT_RATE: 400,
  VAT_RATE_NOT_FOUND: 404,
  VAT_RATE_OVERLAP: 400,
  COST_CENTER_NOT_FOUND: 404,
  COST_CENTER_IN_USE: 400,
  BANK_FILE_FORMAT_NOT_FOUND: 404,
  BANK_FILE_NOT_TESTED: 400,
  NUMBERING_SEQ_NOT_EDITABLE: 400,
  PERIOD_LOCKED_DIRECT_EDIT: 400,
}

const MESSAGES: Record<SettingsErrorCode, ErrorMessage> = {
  CYCLE_NOT_FOUND: {
    title: 'ไม่พบรอบบิล/รอบจ่าย',
    message: 'ไม่พบรอบที่ระบุ หรือรอบนี้ถูกลบไปแล้ว',
  },
  DUPLICATE_CYCLE_NAME: {
    title: 'ชื่อรอบซ้ำ',
    message: 'มีรอบชื่อนี้อยู่แล้วในองค์กร — ใช้ชื่ออื่น',
  },
  APPROVAL_MATRIX_NOT_FOUND: {
    title: 'ไม่พบสายอนุมัติ',
    message: 'ไม่พบสายอนุมัติที่ระบุ หรือถูกลบไปแล้ว',
  },
  BANK_ACCOUNT_NOT_FOUND: {
    title: 'ไม่พบบัญชีธนาคาร',
    message: 'ไม่พบบัญชีธนาคารที่ระบุ หรือถูกลบไปแล้ว',
  },
  DUPLICATE_BANK_ACCOUNT: {
    title: 'เลขบัญชีซ้ำ',
    message: 'มีบัญชีธนาคารเลขนี้อยู่แล้วในองค์กร (`02` §5 UNIQUE organization_id, account_number)',
  },
  BANK_ACCOUNT_IN_USE: {
    title: 'ลบบัญชีที่มีรายการเงินผูกอยู่ไม่ได้',
    message:
      'บัญชีนี้มีรอบจ่ายเงินหรือรายการเดินบัญชีผูกอยู่แล้ว — แก้ไขได้แต่ลบไม่ได้ (`13` §9) ปิดการใช้งานด้วยการเปลี่ยน usage แทน',
  },
  TAX_PROFILE_NOT_FOUND: {
    title: 'ไม่พบกติกาภาษี',
    message: 'ไม่พบ Tax Profile ที่ระบุ หรือถูกลบไปแล้ว',
  },
  DUPLICATE_TAX_PROFILE_NAME: {
    title: 'ชื่อกติกาภาษีซ้ำ',
    message: 'มี Tax Profile ชื่อนี้อยู่แล้วในองค์กร — ใช้ชื่ออื่น',
  },
  TAX_PROFILE_IN_USE: {
    title: 'ลบกติกาภาษีที่ถูกใช้อยู่ไม่ได้',
    message: 'Tax Profile นี้ถูกผูกกับผู้รับเงินหรือรายการจ่ายไปแล้ว — แก้อัตราได้แต่ลบไม่ได้ (ยอดภาษีเดิมต้องอ้างอิงได้)',
  },
  INVALID_WHT_RATE: {
    title: 'อัตราหัก ณ ที่จ่ายไม่ถูกต้อง',
    message: 'อัตรา WHT ต้องอยู่ระหว่าง 0-100% (`13` §10)',
  },
  VAT_RATE_NOT_FOUND: {
    title: 'ไม่พบอัตรา VAT ที่ครอบคลุมวันที่นี้',
    message: 'ไม่มีอัตรา VAT ที่มีผลครอบคลุมวันที่ที่ระบุ — ตั้งอัตราให้ครอบคลุมก่อน (`19` §6.3)',
  },
  VAT_RATE_OVERLAP: {
    title: 'ช่วงเวลาอัตรา VAT ทับกัน',
    message: 'ช่วงวันที่มีผลของอัตราใหม่ทับกับอัตราที่มีอยู่ — ปิดช่วงของอัตราเดิม (ระบุวันสิ้นสุด) ก่อนเพิ่มอัตราใหม่',
  },
  COST_CENTER_NOT_FOUND: {
    title: 'ไม่พบศูนย์ต้นทุน',
    message: 'ไม่พบศูนย์ต้นทุนที่ระบุ หรือถูกลบไปแล้ว',
  },
  COST_CENTER_IN_USE: {
    title: 'ลบศูนย์ต้นทุนที่มีรายการผูกอยู่ไม่ได้',
    message: 'ศูนย์ต้นทุนนี้ถูกใช้ในรายการค่าใช้จ่ายแล้ว — ปิดการใช้งานแทนการลบ',
  },
  BANK_FILE_FORMAT_NOT_FOUND: {
    title: 'ไม่พบรูปแบบไฟล์ธนาคาร',
    message: 'ไม่พบรูปแบบไฟล์ธนาคารที่ระบุ หรือถูกลบไปแล้ว',
  },
  BANK_FILE_NOT_TESTED: {
    title: 'รูปแบบไฟล์ธนาคารยังไม่ผ่านการทดสอบ',
    message: 'ต้องทดสอบไฟล์ตัวอย่างให้ผ่าน (test_status = passed) ก่อนนำไปสร้างไฟล์โอนเงินจริง (`13` §6.8)',
  },
  NUMBERING_SEQ_NOT_EDITABLE: {
    title: 'แก้เลขล่าสุดด้วยมือไม่ได้',
    message: 'เลขที่ใบกำกับภาษีล่าสุดระบบเดินให้อัตโนมัติ ห้ามแก้มือ (`13` §6.12 — เลขต้องต่อเนื่องตามกฎหมาย)',
  },
  PERIOD_LOCKED_DIRECT_EDIT: {
    title: 'รอบบัญชีถูกล็อกแล้ว',
    message: 'รอบบัญชีนี้ปิดแล้ว แก้ข้อมูลต้นทางโดยตรงไม่ได้ — ต้องสร้างรายการปรับปรุง (Adjustment) แทน (`13` §6.11)',
  },
}

export function settingsErrorStatus(code: SettingsErrorCode): number {
  return HTTP_STATUS[code]
}

export function settingsErrorMessage(code: SettingsErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class SettingsError extends ModuleError<SettingsErrorCode> {
  constructor(code: SettingsErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'SettingsError'
  }
}

export function isSettingsError(error: unknown): error is SettingsError {
  return error instanceof SettingsError
}
