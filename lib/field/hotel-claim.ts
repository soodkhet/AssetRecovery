import { FieldError } from '@/lib/field/errors'
import { bahtInputError, fmtSatang, fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'

/**
 * เบิกที่พัก — กลุ่ม "เบิกแยก" ของ `41` §6.6 · §11 · §12 — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * - ที่พัก **ไม่ผูกกับเคสเดียว** เพราะใบเสร็จ 1 ใบครอบหลายวัน/หลายเคสได้ (`41` §11)
 * - `matched_case_ids` = auto-mapping กับเคสที่ `schedule_date` อยู่ในช่วงวันที่พัก (`hotelStayDateKeys()`) — **ใช้ตรวจสอบเท่านั้น
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

// ── จำนวนคืน (มติ PO O50 · `41` §6.6 · `22` §6.15) ──────────────────────────────

/** จำนวนคืนต่อใบเบิก — ไม่บังคับกรอก (ว่าง = 1) · จำนวนเต็ม 1–31 · DB CHECK ช่วงเดียวกัน */
export const HOTEL_NIGHTS_DEFAULT = 1
export const HOTEL_NIGHTS_MIN = 1
export const HOTEL_NIGHTS_MAX = 31

export const HOTEL_NIGHTS_RANGE_MESSAGE = `จำนวนคืนต้องเป็นจำนวนเต็ม ${HOTEL_NIGHTS_MIN}–${HOTEL_NIGHTS_MAX}`

export function isValidHotelNights(nights: number): boolean {
  return Number.isInteger(nights) && nights >= HOTEL_NIGHTS_MIN && nights <= HOTEL_NIGHTS_MAX
}

/**
 * ค่าจากช่อง "จำนวนคืน" ของฟอร์ม → จำนวนเต็ม · ว่าง = ค่าเริ่มต้น 1 · ไม่ใช่จำนวนเต็มบวกในช่วง = `null`
 * (ไม่ปัด/ไม่ตัดเศษ — "1.5" หรือ "2 คืน" ถือว่าผิด)
 */
export function parseHotelNightsInput(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return HOTEL_NIGHTS_DEFAULT
  if (!/^\d+$/.test(trimmed)) return null
  const nights = Number(trimmed)
  return isValidHotelNights(nights) ? nights : null
}

/**
 * วันที่ (`YYYY-MM-DD`) ที่ใบเบิกครอบ = วันเข้าพัก … วันเข้าพัก + จำนวนคืน − 1
 * ใช้เป็นช่วงของ auto-mapping `matched_case_ids` (ตรวจสอบเท่านั้น ไม่มีผลต่อยอด)
 */
export function hotelStayDateKeys(checkInDate: string, nights: number): string[] {
  if (!isValidHotelNights(nights)) throw new RangeError(HOTEL_NIGHTS_RANGE_MESSAGE)
  const start = new Date(`${checkInDate}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime())) throw new RangeError('วันที่เข้าพักไม่ถูกต้อง')
  return Array.from({ length: nights }, (_, offset) =>
    new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10),
  )
}

/**
 * ป้ายสั้นของช่อง "ใบเสร็จออกในนามบริษัท" (มติ PO U96 #14) — รายการเบิก/คิวอนุมัติใช้ข้อความเดียวกัน
 * ใช้ให้ผู้อนุมัติ/สำนักงานบัญชีเห็นประกอบการพิจารณาภาษีเท่านั้น — ไม่มีผลต่อยอดเงินหรือยอดหัก ณ ที่จ่ายในระบบ
 */
export function receiptInCompanyNameText(receiptInCompanyName: boolean): string {
  return receiptInCompanyName ? 'ใบเสร็จในนามบริษัท' : 'ใบเสร็จไม่ได้ออกในนามบริษัท'
}

/** ข้อความสั้น "2 คืน · เพดาน ฿1,600.00" (ไม่ตั้งเพดาน → "2 คืน") — ใช้ทั้งรายการเบิกและคิวอนุมัติ */
export function hotelNightsCapText(nights: number, maxPerNightSatang: number | null): string {
  const cap = hotelClaimCapSatang(maxPerNightSatang, nights)
  return cap === null ? `${nights} คืน` : `${nights} คืน · เพดาน ${fmtSatangSymbol(cap)}`
}

/**
 * ข้อความ inline ของฟอร์มเบิกที่พัก — แยกต่อช่อง (UAT BUG-073: ยอด 0/ติดลบเคยขึ้นข้อความรวม
 * "กรุณากรอกวันที่และจำนวนเงิน" ทำให้เข้าใจว่าวันที่ว่าง) · คืน `null` = ผ่าน
 * ⚠️ UX guard ฝั่งฟอร์ม — ตัวบังคับจริงคือ `assertHotelClaimFields()` + Zod ฝั่ง BE
 */
export function hotelClaimFormError(input: {
  expenseDate: string
  amountBaht: string
  hasReceipt: boolean
  /** ช่อง "จำนวนคืน" (ไม่บังคับ — ไม่ส่ง/ว่าง = 1) */
  nightsText?: string
}): string | null {
  if (input.expenseDate.trim() === '') return 'กรุณาเลือกวันที่เข้าพัก'
  if (input.nightsText !== undefined && parseHotelNightsInput(input.nightsText) === null) {
    return HOTEL_NIGHTS_RANGE_MESSAGE
  }
  const amountSatang = parseBahtInput(input.amountBaht)
  if (amountSatang === null) return 'กรุณากรอกจำนวนเงิน'
  const formatError = bahtInputError(input.amountBaht, 'จำนวนเงิน')
  if (formatError !== null) return formatError
  if (Number.isNaN(amountSatang)) return 'จำนวนเงินต้องเป็นตัวเลข'
  if (amountSatang <= 0) return 'จำนวนเงินต้องมากกว่า 0'
  if (!input.hasReceipt) return 'ต้องแนบใบเสร็จก่อนส่งคำขอเบิก'
  return null
}

// ── เพดานค่าที่พักต่อคืน (มติ PO 06/10/2569 U89 · `22` §6.15 · `41` §6.6) ─────────────

export interface HotelCapInput {
  /** ยอดที่ขอเบิก (สตางค์) */
  amountSatang: number
  /** `hotel_max_per_night_satang` ของแผนที่ snapshot ไว้ — `null` = แผนไม่ตั้งเพดาน (ไม่จำกัด) */
  maxPerNightSatang: number | null
  /** จำนวนคืนของใบเบิก (`expenses.hotel_nights` — มติ PO O50 · ไม่กรอก = 1) */
  nights: number
}

/**
 * เพดานรวมของใบเบิก = เพดานต่อคืน × จำนวนคืน — `null` = ไม่จำกัด
 * พักร่วม (`shared_with`) คิด**ต่อห้อง** ⇒ จำนวนผู้พักไม่ทำให้เพดานเพิ่ม (คนเบิกคนเดียวเบิกได้ไม่เกินเพดานห้อง)
 */
export function hotelClaimCapSatang(maxPerNightSatang: number | null, nights: number): number | null {
  if (maxPerNightSatang === null) return null
  if (!Number.isInteger(maxPerNightSatang) || maxPerNightSatang < 0) {
    throw new RangeError('เพดานค่าที่พักต่อคืนต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ')
  }
  if (!isValidHotelNights(nights)) throw new RangeError(HOTEL_NIGHTS_RANGE_MESSAGE)
  return maxPerNightSatang * nights
}

/** ข้อความบอกเพดานเป็นบาท — ใช้ทั้ง error ของ API และฟอร์ม */
export function hotelCapExceededMessage(input: HotelCapInput): string {
  const cap = hotelClaimCapSatang(input.maxPerNightSatang, input.nights)
  const perNight = `${fmtSatang(input.maxPerNightSatang)} บาท/คืน`
  const capText = input.nights === 1 ? perNight : `${perNight} × ${input.nights} คืน = ${fmtSatang(cap)} บาท`
  return `ยอดเบิก ${fmtSatang(input.amountSatang)} บาท เกินเพดานค่าที่พัก ${capText} — แก้ยอดให้ไม่เกินเพดานแล้วส่งใหม่ (พักร่วมห้องคิดเพดานต่อห้อง)`
}

/** เกินเพดาน (แม้ 1 สตางค์) = บล็อก · เท่าเพดานพอดี = ผ่าน · ไม่ตั้งเพดาน = ไม่จำกัด */
export function isHotelClaimOverCap(input: HotelCapInput): boolean {
  const cap = hotelClaimCapSatang(input.maxPerNightSatang, input.nights)
  return cap !== null && input.amountSatang > cap
}

export function assertHotelClaimWithinCap(input: HotelCapInput): void {
  if (!isHotelClaimOverCap(input)) return
  throw new FieldError('HOTEL_CLAIM_EXCEEDS_CAP', {
    message: hotelCapExceededMessage(input),
    context: {
      amountSatang: input.amountSatang,
      maxPerNightSatang: input.maxPerNightSatang,
      nights: input.nights,
      capSatang: hotelClaimCapSatang(input.maxPerNightSatang, input.nights),
    },
  })
}
