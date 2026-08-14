import { BUDDHIST_YEAR_OFFSET } from '@/lib/constants'
import { MONTH_NAMES_TH } from '@/lib/field/calendar'
import { toBangkokParts } from '@/lib/format/datetime'

/**
 * ตัวกรอง "เดือน" ที่ใช้ร่วมกัน 3 หน้าจอ (`41` §7.9 เบิกแยก · §7.10 สรุปรายได้ · §7.11 จบงาน) — **pure ล้วน**
 *
 * - คีย์เดือนเป็น **ค.ศ. `YYYY-MM`** เพราะเป็นค่าที่ส่งเข้า API (`GET /api/field/income-summary?month=`)
 * - ป้ายบนหน้าจอเป็น **พ.ศ.** เสมอ เช่น `สิงหาคม 2569` (Rule 01)
 * - instant (ISO UTC) ต้องแปลงเป็นเวลาไทยก่อนหาเดือน — เคสที่ปิด 01/09 06:00 น. ไทย = `2026-09` ไม่ใช่ `2026-08`
 */

/** ค่าของตัวเลือก "ทุกเดือน" ใน `<select>` — ส่ง `undefined` ต่อไปยัง API (ไม่กรอง) */
export const ALL_MONTHS = 'all'

export interface MonthOption {
  /** `YYYY-MM` (ค.ศ.) หรือ {@link ALL_MONTHS} */
  value: string
  label: string
}

/** เดือนของค่าวันที่แบบ `YYYY-MM-DD` (คอลัมน์ `DATE` — ไม่มีเขตเวลาให้แปลง) */
export function monthKeyOfDateOnly(dateIso: string): string {
  return dateIso.slice(0, 7)
}

/** เดือน (เวลาไทย) ของ instant ISO UTC — คืน `null` เมื่อค่าว่าง/ไม่ถูกต้อง */
export function monthKeyOfInstant(instant: string | null | undefined): string | null {
  if (instant === null || instant === undefined || instant === '') return null
  const parts = toBangkokParts(instant)
  if (parts === null) return null
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`
}

/** ป้ายเดือนแบบไทย + **พ.ศ.** — คีย์ที่อ่านไม่ได้คืนค่าเดิม (กันจอพัง) */
export function monthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split('-')
  const year = Number(yearText)
  const name = MONTH_NAMES_TH[Number(monthText) - 1]
  if (Number.isNaN(year) || name === undefined) return monthKey
  return `${name} ${year + BUDDHIST_YEAR_OFFSET}`
}

/**
 * ตัวเลือกเดือนของ dropdown — สร้างจากข้อมูลจริงที่มีเท่านั้น (ไม่เดาเดือนล่วงหน้า)
 * เรียงใหม่→เก่า และมีตัวเลือก "ทุกเดือน" เป็นตัวแรกเสมอ (default ของ §7.9/§7.10/§7.11 = ไม่กรอง)
 */
export function monthOptions(monthKeys: readonly (string | null)[], allLabel = 'ทุกเดือน'): MonthOption[] {
  const unique = [...new Set(monthKeys.filter((key): key is string => key !== null && key !== ''))]
  unique.sort((a, b) => b.localeCompare(a))
  return [{ value: ALL_MONTHS, label: allLabel }, ...unique.map((key) => ({ value: key, label: monthLabel(key) }))]
}

/** ตัวกรองเดือนผ่านหรือไม่ — `ALL_MONTHS`/ค่าว่าง = ผ่านทุกแถว */
export function matchesMonth(selected: string, monthKey: string | null): boolean {
  if (selected === ALL_MONTHS || selected === '') return true
  return monthKey === selected
}

/** ค่าที่ส่งเข้า query `month=` ของ API — "ทุกเดือน" = ไม่ส่งพารามิเตอร์ */
export function monthQueryValue(selected: string): string | undefined {
  return selected === ALL_MONTHS || selected === '' ? undefined : selected
}
