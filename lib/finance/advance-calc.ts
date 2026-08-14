import { FinanceError } from '@/lib/finance/errors'
import { assertNonNegativeSatang } from '@/lib/finance/satang'

/**
 * เงินทดรองจ่าย — ยอดคืน (`22` §6.13 · `15` §6.2) — **pure ล้วน ไม่มี I/O**
 *
 * ### เอกสารสองฉบับใช้ฐานคนละตัว — แยกฟังก์ชันให้ตรงกับ SSOT ของแต่ละฝั่ง (ห้ามเดารวมเป็นตัวเดียว)
 * - **ยอดคืน**: `02` §5 กำหนดคอลัมน์ `advances.return_satang` เป็น **generated column** ของ DB จริง
 *   `GREATEST(0, COALESCE(approved_satang, 0) - used_satang)` ⇒ ฐานคือ **ยอดที่อนุมัติ** (เงินที่จ่ายออกไปจริง)
 *   ไม่ใช่ยอดที่ขอ — `advanceReturnSatang()` มิเรอร์สูตรนี้เป๊ะ (ลำดับเอกสาร: `02` ชนะ `22` §6.13 ที่เขียนว่า requested)
 * - **การปฏิเสธตอนเคลียร์ยอด**: `24` §6.4 นิยาม `USED_EXCEEDS_REQUEST_NO_TOPUP` ว่าเทียบกับ
 *   **ยอดที่ขอเบิก** ⇒ `assertSettlementAllowed()` เทียบกับ `requested` ตามนั้น
 *
 * ⚠️ ห้ามเขียนค่า `return_satang` ลง DB เอง (Prisma มองเป็นคอลัมน์ธรรมดาแล้วไปตายที่ DB — ดู REUSE_INDEX)
 * ฟังก์ชันนี้ใช้สำหรับ **แสดงผล/ตรวจสอบ/สรุปยอด** ก่อนบันทึกเท่านั้น
 */

export interface AdvanceSettlementInput {
  /** ยอดที่ขอเบิก (`advances.requested_satang`) */
  requestedSatang: number
  /** ยอดที่อนุมัติจริง (`advances.approved_satang`) — `null` = ยังไม่อนุมัติ ⇒ ยังไม่มีเงินออก */
  approvedSatang: number | null
  /** ยอดใช้จริงตอนเคลียร์ยอด (`advances.used_satang`) */
  usedSatang: number
}

export interface AdvanceSettlement {
  /** ยอดที่ต้องคืนบริษัท — **ไม่ติดลบเด็ดขาด** (`22` §6.13) */
  returnSatang: number
  /** ส่วนที่ใช้เกินยอดอนุมัติ — ต้องสร้าง Claim ใหม่แยก ไม่ใช่เพิ่มยอดทดรองย้อนหลัง */
  excessSatang: number
  /** true = ใช้เกินยอดอนุมัติ ⇒ ต้องเบิกส่วนเกินเป็นรายการใหม่ */
  needsExtraClaim: boolean
}

/** `02` §5 (generated column) — `GREATEST(0, COALESCE(approved, 0) - used)` */
export function advanceReturnSatang(input: Pick<AdvanceSettlementInput, 'approvedSatang' | 'usedSatang'>): number {
  const approved = input.approvedSatang ?? 0
  assertNonNegativeSatang(approved, 'ยอดที่อนุมัติ')
  assertNonNegativeSatang(input.usedSatang, 'ยอดใช้จริง')
  return Math.max(0, approved - input.usedSatang)
}

/** ยอดคืน + ส่วนเกิน สำหรับหน้าจอเคลียร์ยอด (`15` §8) */
export function advanceSettlement(input: AdvanceSettlementInput): AdvanceSettlement {
  const approved = input.approvedSatang ?? 0
  const returnSatang = advanceReturnSatang(input)
  const excessSatang = Math.max(0, input.usedSatang - approved)
  return { returnSatang, excessSatang, needsExtraClaim: excessSatang > 0 }
}

/**
 * `24` §6.4 — เคลียร์ยอดที่ `used > requested` ถูกปฏิเสธ (`USED_EXCEEDS_REQUEST_NO_TOPUP`)
 * ระบบ**ไม่**เพิ่มยอดทดรองย้อนหลัง — ส่วนเกินต้องเบิกเป็น Claim ใหม่ (`15` §11)
 */
export function assertSettlementAllowed(input: Pick<AdvanceSettlementInput, 'requestedSatang' | 'usedSatang'>): void {
  assertNonNegativeSatang(input.requestedSatang, 'ยอดที่ขอเบิก')
  assertNonNegativeSatang(input.usedSatang, 'ยอดใช้จริง')
  if (input.usedSatang > input.requestedSatang) {
    throw new FinanceError('USED_EXCEEDS_REQUEST_NO_TOPUP', {
      detail: `used=${input.usedSatang} requested=${input.requestedSatang}`,
      context: { requestedSatang: input.requestedSatang, usedSatang: input.usedSatang },
    })
  }
}
