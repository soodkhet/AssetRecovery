import { FieldError } from '@/lib/field/errors'
import { bahtInputError, parseBahtInput } from '@/lib/format/money'

/**
 * เบิกที่พัก — กลุ่ม "เบิกแยก" ของ `41` §6.6 · §11 · §12 — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * - ที่พัก **ไม่ผูกกับเคสเดียว** เพราะใบเสร็จ 1 ใบครอบหลายวัน/หลายเคสได้ (`41` §11)
 * - `matched_case_ids` = auto-mapping กับเคสที่ `schedule_date` ตรงกับวันที่เบิก — **ใช้ตรวจสอบเท่านั้น
 *   ไม่มีผลต่อยอดเงิน** (`41` §6.6) ⇒ ที่นี่ไม่มีสูตรคิดเงินจาก matched cases เด็ดขาด
 * - ผู้พักร่วมเลือกได้เฉพาะคนในทีมเดียวกัน — dropdown กรองให้แล้ว แต่ **validate ซ้ำฝั่ง BE** (`41` §12)
 */

export interface HotelClaimFields {
  /** วันที่เข้าพัก (เบิกย้อนหลังได้เสมอ — `41` §6.6) */
  expenseDate: Date | null
  amountSatang: number | null
  receiptFileUrl: string | null
}

/** ทั้ง 3 ฟิลด์บังคับ (`41` §12 `HOTEL_CLAIM_FIELD_REQUIRED`) — คืนรายชื่อช่องที่ขาดไว้ให้ FE ไฮไลต์ */
export function missingHotelClaimFields(input: HotelClaimFields): string[] {
  const missing: string[] = []
  if (input.expenseDate === null || Number.isNaN(input.expenseDate.getTime())) missing.push('expenseDate')
  if (input.amountSatang === null || !Number.isInteger(input.amountSatang) || input.amountSatang <= 0) {
    missing.push('amountSatang')
  }
  if (input.receiptFileUrl === null || input.receiptFileUrl.trim() === '') missing.push('receiptFileUrl')
  return missing
}

export function assertHotelClaimFields(input: HotelClaimFields): void {
  const missing = missingHotelClaimFields(input)
  if (missing.length > 0) throw new FieldError('HOTEL_CLAIM_FIELD_REQUIRED', { context: { missing } })
}

/**
 * ผู้พักร่วมต้องอยู่ทีมเดียวกับผู้เบิก (`41` §6.6/§12) — เบิกให้ตัวเองซ้ำก็ไม่ได้
 * `teammateIds` = สมาชิกทีมเดียวกัน **ไม่รวมตัวผู้เบิก** (ผู้เรียกเป็นคนเตรียมมาให้)
 */
export function assertSharedAgentInTeam(
  sharedWithUserId: string | null | undefined,
  teammateIds: readonly string[],
): void {
  if (sharedWithUserId === null || sharedWithUserId === undefined) return
  if (!teammateIds.includes(sharedWithUserId)) {
    throw new FieldError('HOTEL_CLAIM_INVALID_SHARED_AGENT', { context: { sharedWithUserId } })
  }
}

/**
 * ข้อความ inline ของฟอร์มเบิกที่พัก — แยกต่อช่อง (UAT BUG-073: ยอด 0/ติดลบเคยขึ้นข้อความรวม
 * "กรุณากรอกวันที่และจำนวนเงิน" ทำให้เข้าใจว่าวันที่ว่าง) · คืน `null` = ผ่าน
 * ⚠️ UX guard ฝั่งฟอร์ม — ตัวบังคับจริงคือ `assertHotelClaimFields()` + Zod ฝั่ง BE
 */
export function hotelClaimFormError(input: { expenseDate: string; amountBaht: string; hasReceipt: boolean }): string | null {
  if (input.expenseDate.trim() === '') return 'กรุณาเลือกวันที่เข้าพัก'
  const amountSatang = parseBahtInput(input.amountBaht)
  if (amountSatang === null) return 'กรุณากรอกจำนวนเงิน'
  const formatError = bahtInputError(input.amountBaht, 'จำนวนเงิน')
  if (formatError !== null) return formatError
  if (Number.isNaN(amountSatang)) return 'จำนวนเงินต้องเป็นตัวเลข'
  if (amountSatang <= 0) return 'จำนวนเงินต้องมากกว่า 0'
  if (!input.hasReceipt) return 'ต้องแนบใบเสร็จก่อนส่งคำขอเบิก'
  return null
}
