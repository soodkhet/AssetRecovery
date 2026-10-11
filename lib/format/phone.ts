/**
 * staging E-023 — แสดงเบอร์โทรไทยแบบอ่านง่าย (เก็บดิบ — format ตอนแสดงเท่านั้น)
 * มือถือ 10 หลัก `081-234-5678` · กรุงเทพฯ 9 หลัก `02-234-5678` · ต่างจังหวัด 9 หลัก `053-123-456`
 * รูปแบบอื่น (มีต่อ/เบอร์ต่างประเทศ/ความยาวอื่น) ⇒ คืนค่าเดิม (ไม่เดา)
 */
export function fmtThaiPhone(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  const digits = raw.replace(/[\s-]/g, '')
  if (!/^0\d{8,9}$/.test(digits)) return raw
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.startsWith('02')) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

/** ส่วน "ต่อ/ext" ท้ายเบอร์สำนักงาน เช่น `02-111-2233 ต่อ 12` · `02-111-2233 ext. 12` · `#12` */
const PHONE_EXTENSION = /\s*(?:ต่อ|ext\.?|x|#)\s*\d{1,6}\s*$/i

/**
 * mytester A-04 — ตรวจว่าเป็นเบอร์โทรไทยที่โทรได้จริง (เบอร์สำนักงานพิมพ์บนหัวใบกำกับภาษี)
 * รับ: ขึ้นต้น 0 ตัวเลขรวม 9–10 หลัก (บ้าน/สำนักงาน 9 · มือถือ 10) หรือ `+66` แทน 0 ตัวหน้า
 * คั่นด้วยช่องว่าง/ขีด/วงเล็บ/จุดได้ · ต่อท้ายเบอร์ต่อได้ (`ต่อ 12`) · อื่น ๆ = ไม่ผ่าน
 */
export function isThaiPhone(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim().replace(PHONE_EXTENSION, '')
  if (!/^[+\d\s().-]+$/.test(raw)) return false
  let digits = raw.replace(/[\s().-]/g, '')
  if (digits.startsWith('+66')) digits = `0${digits.slice(3)}`
  return /^0\d{8,9}$/.test(digits)
}
