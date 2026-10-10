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
