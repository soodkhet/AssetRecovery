import { ModuleError, type ErrorMessage } from '@/lib/api/errors'

/**
 * Error code หมวดรอบจ่ายเงิน (ไฟล์ 17) — SSOT อยู่ที่ `docs/24-finance-validation-rules.md` §6.5
 * ⚠️ ห้ามตั้ง code ใหม่ที่นี่โดยไม่เพิ่มลงไฟล์ 24 ใน commit เดียวกัน (Rule 04)
 *
 * `DUPLICATE_PAYMENT_FILE` **ไม่อยู่ในรายการนี้โดยตั้งใจ** — เป็น "เตือน ไม่ block" (`17` §11)
 * จึงออกทาง `warning` ของ envelope ไม่ใช่ throw (ดู `duplicatePaymentFileWarning()` ใน `payout.ts`)
 * `BANK_FILE_NOT_TESTED` เป็นของ `SettingsError` (`assertBankFileUsable()` ของ 1.10) ห้าม declare ซ้ำ
 */

export const PAYOUT_ERROR_CODES = [
  'UNVERIFIED_PAYEE_IN_PAYOUT',
  'MIXED_SIDE_BATCH',
  'PAYOUT_BATCH_NOT_FOUND',
  'PAYOUT_BATCH_INVALID_STATUS',
  'NO_ITEMS_TO_PAY',
  'PAYMENT_FILE_NOT_GENERATED',
  // มติ PO 05/10/2569 (UAT U7) — ผู้รับประเภท 40(2) ต้องมีอัตราหักต่อคนก่อนสร้างรอบ
  'WHT_40_2_RATE_MISSING',
  // มติ PO 06/10/2569 U105 — ผู้รับตั้งเงื่อนไข (2)/(3) แต่ค่าตั้งภาษียังไม่อนุญาต ⇒ บล็อกทั้งรอบพร้อมรายชื่อ
  'WHT_CONDITION_NOT_ALLOWED',
  // มติ PO U67 (05/10/2569) — ยกเลิกรอบจ่าย: เหตุผลบังคับ (code ร่วมกับหมวดเอกสาร) · โอนแล้วยกเลิกไม่ได้
  // · รอบที่สร้างไฟล์โอนแล้วต้องยืนยันว่ายังไม่ได้ส่งไฟล์เข้าธนาคาร
  'CANCEL_REQUIRES_REASON',
  'PAYOUT_BATCH_ALREADY_PAID',
  'PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED',
] as const

export type PayoutErrorCode = (typeof PAYOUT_ERROR_CODES)[number]

/** 404 = ไม่พบเป้าหมาย (ไม่ leak ว่ามีอยู่จริงใน scope อื่น) · 400 = ผิดกติกาข้อมูล/สถานะ */
const HTTP_STATUS: Record<PayoutErrorCode, number> = {
  UNVERIFIED_PAYEE_IN_PAYOUT: 400,
  MIXED_SIDE_BATCH: 400,
  PAYOUT_BATCH_NOT_FOUND: 404,
  PAYOUT_BATCH_INVALID_STATUS: 400,
  NO_ITEMS_TO_PAY: 400,
  PAYMENT_FILE_NOT_GENERATED: 404,
  WHT_40_2_RATE_MISSING: 400,
  WHT_CONDITION_NOT_ALLOWED: 400,
  CANCEL_REQUIRES_REASON: 400,
  PAYOUT_BATCH_ALREADY_PAID: 400,
  PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED: 400,
}

const MESSAGES: Record<PayoutErrorCode, ErrorMessage> = {
  UNVERIFIED_PAYEE_IN_PAYOUT: {
    title: 'มีผู้รับเงินที่ยังไม่ยืนยัน',
    message:
      'รอบจ่ายนี้มีรายการของผู้รับเงินที่ยังไม่ผ่านการยืนยันข้อมูลธนาคาร/ภาษี — ต้องยืนยันให้ครบก่อนสร้างรอบจ่าย',
  },
  MIXED_SIDE_BATCH: {
    title: 'รวมสองฝั่งในรอบเดียวไม่ได้',
    message: 'รอบจ่ายเงิน 1 รอบต้องเป็น Inhouse หรือ Outsource อย่างเดียวเท่านั้น',
  },
  PAYOUT_BATCH_NOT_FOUND: {
    title: 'ไม่พบรอบจ่ายเงิน',
    message: 'ไม่พบรอบจ่ายเงินนี้ หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  },
  PAYOUT_BATCH_INVALID_STATUS: {
    title: 'สถานะรอบจ่ายไม่ถูกต้อง',
    message: 'สถานะปัจจุบันของรอบจ่ายเงินทำรายการนี้ไม่ได้',
  },
  NO_ITEMS_TO_PAY: {
    title: 'ไม่มีรายการที่ต้องจ่าย',
    message: 'ไม่มีรายการที่อนุมัติแล้วและยังไม่ถูกจ่ายภายในวันตัดรอบที่เลือก',
  },
  PAYMENT_FILE_NOT_GENERATED: {
    title: 'ยังไม่มีไฟล์โอนเงิน',
    message: 'รอบจ่ายนี้ยังไม่ได้สร้างไฟล์โอนเงิน — กด "สร้างไฟล์โอน" ก่อน',
  },
  WHT_40_2_RATE_MISSING: {
    title: 'ผู้รับเงินประเภท 40(1)/40(2) ยังไม่มีอัตราหัก',
    message:
      'ค่าตั้งภาษีจัดผู้รับเงินบางคนเป็นเงินได้ 40(1) หรือ 40(2) แต่ยังไม่ได้กรอก "อัตราหัก 40(1)/40(2)" ในข้อมูลผู้รับเงิน — กรอกอัตราที่สำนักงานบัญชีคำนวณให้ก่อนสร้างรอบจ่าย',
  },
  WHT_CONDITION_NOT_ALLOWED: {
    title: 'เงื่อนไขการหักภาษีของผู้รับยังไม่เปิดใช้',
    message:
      'มีผู้รับเงินที่ตั้งเงื่อนไข "ออกให้ตลอดไป" หรือ "ออกให้ครั้งเดียว" แต่ค่าตั้งภาษียังไม่อนุญาตเงื่อนไขนี้ — เปลี่ยนผู้รับเป็น "หัก ณ ที่จ่าย" หรือเปิดค่าตั้งก่อนสร้างรอบจ่าย',
  },
  CANCEL_REQUIRES_REASON: {
    title: 'ต้องระบุเหตุผลการยกเลิก',
    message: 'การยกเลิกรอบจ่ายกระทบยอดเงินที่ต้องจ่าย — กรอกเหตุผลอย่างน้อย 5 ตัวอักษรก่อนยืนยัน',
  },
  PAYOUT_BATCH_ALREADY_PAID: {
    title: 'รอบจ่ายนี้โอนเงินแล้ว',
    message:
      'ยกเลิกได้เฉพาะรอบที่ยังไม่ได้โอนเงินจริง — รอบที่จ่ายสำเร็จแล้วต้องแก้ไขผ่านรายการปรับปรุง (Adjustment)',
  },
  PAYOUT_CANCEL_FILE_CONFIRM_REQUIRED: {
    title: 'ต้องยืนยันว่ายังไม่ได้ส่งไฟล์โอนเข้าธนาคาร',
    message:
      'รอบจ่ายนี้สร้างไฟล์โอนแล้ว — ตรวจสอบกับระบบธนาคารว่ายังไม่ได้อัปโหลดไฟล์และยังไม่มีการโอน แล้วติ๊กยืนยันก่อนยกเลิก (ไม่งั้นรายการที่สร้างรอบใหม่อาจถูกโอนซ้ำ)',
  },
}

export function payoutErrorStatus(code: PayoutErrorCode): number {
  return HTTP_STATUS[code]
}

export function payoutErrorMessage(code: PayoutErrorCode): ErrorMessage {
  return MESSAGES[code]
}

export class PayoutError extends ModuleError<PayoutErrorCode> {
  constructor(code: PayoutErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], HTTP_STATUS[code], options)
    this.name = 'PayoutError'
  }
}

export function isPayoutError(error: unknown): error is PayoutError {
  return error instanceof PayoutError
}
