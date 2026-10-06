import { fmtRatePct, fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'
import type { SettingHelpExampleLine } from '@/lib/settings/help/types'

/**
 * ค่ากลางของคำอธิบายค่าตั้ง (U108) — ผู้มีสิทธิ์แก้ + ยอดตัวอย่าง (เป็น **ค่าตั้งต้น** ของตัวอย่าง ไม่ใช่ผลลัพธ์)
 * ผลลัพธ์ทุกตัวต้องได้จากฟังก์ชันสูตรจริง (`lib/finance/*`, `lib/wht/*`, `lib/settings/*`) เท่านั้น
 */

const AUDIT_NOTE = 'ทุกการแก้ต้องระบุเหตุผลและถูกบันทึกประวัติถาวร'

/** สิทธิ์ล็อก (มอบให้ role อื่นไม่ได้) */
export const WHO_SUPERADMIN_ONLY = `Superadmin เท่านั้น (สิทธิ์นี้ล็อกไว้ มอบให้บทบาทอื่นไม่ได้) · ${AUDIT_NOTE}`
/** `manage_settings` — ค่าเริ่มต้นมีแต่ Superadmin */
export const WHO_SETTINGS = `Superadmin หรือบทบาทที่ได้รับสิทธิ์ "จัดการการตั้งค่าระบบ" · ${AUDIT_NOTE}`
/** `manage_wht_policy` / `manage_data_retention` */
export const WHO_SUPERADMIN_EXECUTIVE = `Superadmin และฝ่ายบริหาร · ${AUDIT_NOTE}`
/** `manage_holidays` */
export const WHO_HOLIDAYS = `ธุรการ บัญชี การเงิน และ Superadmin (ฝ่ายบริหารดูได้อย่างเดียว) · ${AUDIT_NOTE}`
/** `manage_payee_profile` */
export const WHO_PAYEE = `การเงิน และ Superadmin · ${AUDIT_NOTE}`
/** `manage_compensation_plans` */
export const WHO_COMPENSATION = `Superadmin ฝ่ายบริหาร และการเงิน (บัญชี/ผู้จัดการทีมดูได้อย่างเดียว) · ${AUDIT_NOTE}`
/** หน้าที่ดูอย่างเดียว */
export const WHO_READ_ONLY = 'ไม่มีใครแก้ได้จากหน้าจอนี้ — เป็นรูปแบบตายตัวของระบบ แสดงไว้ให้ตรวจสอบ'

/** ยอดตัวอย่าง (สตางค์) — ตัวตั้งของตัวอย่างเท่านั้น */
export const SAMPLE_INCOME_SATANG = 1_000_000 // ฿10,000
export const SAMPLE_BELOW_THRESHOLD_SATANG = 95_000 // ฿950
export const SAMPLE_ABOVE_THRESHOLD_SATANG = 120_000 // ฿1,200
export const SAMPLE_SERVICE_FEE_SATANG = 100_000 // ฿1,000
export const SAMPLE_HOTEL_SATANG = 160_000 // ฿1,600 (2 คืน)

export function money(satang: number): string {
  return fmtSatangSymbol(satang)
}

export function pct(value: number): string {
  return fmtRatePct(value)
}

export function line(label: string, value: string, strong = false): SettingHelpExampleLine {
  return strong ? { label, value, strong } : { label, value }
}

/**
 * ค่าที่ผู้ใช้กำลังพิมพ์ในช่องบาท → สตางค์สำหรับตัวอย่าง (ช่องว่าง/พิมพ์ไม่ครบ/ติดลบ = `null` ⇒ ไม่แสดงตัวอย่าง)
 * ใช้ `parseBahtInput()` ตัวเดียวกับตอนบันทึก — ไม่คูณ 100 เอง
 */
export function satangFromInput(value: string): number | null {
  const parsed = parseBahtInput(value)
  if (parsed === null || Number.isNaN(parsed) || parsed < 0) return null
  return parsed
}

/** อัตรา % ที่กำลังพิมพ์ (0–100) → ตัวเลข · ไม่ถูกต้อง = `null` */
export function pctFromInput(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null
  return Math.round(parsed * 100) / 100
}

/** จำนวนเต็มบวกที่กำลังพิมพ์ (วัน/ปี/ชั่วโมง) · ไม่ถูกต้อง = `null` */
export function intFromInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}
