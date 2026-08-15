/**
 * จำนวนเงินเป็น **ตัวอักษรภาษาไทย** สำหรับใบสำคัญจ่าย (`28` §6.1 — ตัวอย่าง
 * `reference/samples/05_payment_voucher.pdf` บรรทัด "(แปดพันสองร้อยสี่สิบห้าบาทถ้วน)")
 *
 * **pure ล้วน ไม่มี I/O** · รับ **satang จำนวนเต็ม** เท่านั้น (Rule 01) — ที่นี่ไม่ใช่การคำนวณเงิน
 * เป็นการ "แปลงเป็นข้อความ" เหมือน `fmtSatang()` จึงหาร 100 ได้ (ผลลัพธ์ไม่ถูกนำไปคิดต่อ)
 *
 * ⚠️ ค่าติดลบ/ไม่ใช่จำนวนเต็ม = โยน `RangeError` ทันที (แนวเดียวกับ `bahtAmountString()` ของไฟล์โอน)
 *    เอกสารการเงินต้องไม่พิมพ์ยอดที่อ่านไม่ตรงกับตัวเลข
 */

const DIGIT_WORDS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'] as const

/** หลักของกลุ่มตัวเลข 6 หลัก (หน่วย → แสน) */
const PLACE_WORDS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'] as const

const MILLION = 1_000_000

/**
 * อ่านเลข 1–999,999 เป็นข้อความ
 * @param hasPrefix มีข้อความนำหน้าอยู่แล้วหรือไม่ (เช่น "…ล้าน") — ใช้ตัดสินว่า 1 หลักหน่วยอ่านว่า
 *   "เอ็ด" หรือ "หนึ่ง" (1,000,001 = "หนึ่งล้านเอ็ด" · 1 เดี่ยว ๆ = "หนึ่ง")
 */
function readGroup(value: number, hasPrefix: boolean): string {
  const digits = [...String(value)]
  let text = ''

  for (const [index, char] of digits.entries()) {
    const digit = Number(char)
    const place = digits.length - index - 1
    if (digit === 0) continue

    if (place === 0 && digit === 1 && (digits.length > 1 || hasPrefix)) text += 'เอ็ด'
    else if (place === 1 && digit === 1) text += 'สิบ'
    else if (place === 1 && digit === 2) text += 'ยี่สิบ'
    else text += `${DIGIT_WORDS[digit] ?? ''}${PLACE_WORDS[place] ?? ''}`
  }

  return text
}

/** อ่านจำนวนเต็มใด ๆ เป็นข้อความ — เกิน 6 หลักซอยด้วย "ล้าน" ซ้อนกันได้ไม่จำกัด */
function readInteger(value: number): string {
  if (value === 0) return DIGIT_WORDS[0]
  if (value < MILLION) return readGroup(value, false)

  const high = Math.floor(value / MILLION)
  const rest = value % MILLION
  return `${readInteger(high)}ล้าน${rest === 0 ? '' : readGroup(rest, true)}`
}

/**
 * `824500` → `"แปดพันสองร้อยสี่สิบห้าบาทถ้วน"` · `50` → `"ศูนย์บาทห้าสิบสตางค์"`
 * @param satang จำนวนเต็มหน่วยสตางค์ (≥ 0)
 */
export function bahtInWords(satang: number): string {
  if (!Number.isInteger(satang) || satang < 0) {
    throw new RangeError(`จำนวนเงินต้องเป็นจำนวนเต็มหน่วยสตางค์ที่ไม่ติดลบ — ได้รับ ${String(satang)}`)
  }

  const baht = Math.trunc(satang / 100)
  const remainder = satang % 100
  const bahtText = `${readInteger(baht)}บาท`

  return remainder === 0 ? `${bahtText}ถ้วน` : `${bahtText}${readInteger(remainder)}สตางค์`
}
