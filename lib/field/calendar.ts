import { BUDDHIST_YEAR_OFFSET } from '@/lib/constants'
import type { FieldCaseListItemDto } from '@/lib/field/types'

/**
 * ตารางปฏิทินของ Calendar Picker (`41` §7.4) — **pure ล้วน**
 *
 * ทำ grid เองแบบ Google Calendar (ไม่ใช้ `<input type="date">`) เพราะต้องโชว์ badge จำนวนเคสต่อวัน
 * ⚠️ ทุกฟังก์ชันรับ "วันนี้" เป็น `todayIso` (`YYYY-MM-DD` ตามเวลาไทย จาก `toInputDate(new Date())`)
 * แทนที่จะอ่านนาฬิกาเอง — เพื่อให้เทสต์ได้และไม่เพี้ยนข้ามเขตเวลา (Rule 01)
 * ⚠️ ปี **พ.ศ.** เสมอบนหน้าจอ · คีย์ภายใน (`dateIso`) ยังเป็น ค.ศ. เพราะเป็นค่าที่ส่งเข้า API
 */

export const WEEKDAY_LABELS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

export const MONTH_NAMES_TH = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const

/** เดือนที่ปฏิทินกำลังแสดง — `month` = 1–12 (ไม่ใช่ index ของ `Date`) */
export interface CalendarMonth {
  year: number
  month: number
}

export interface CalendarCell {
  /** `null` = ช่องว่างก่อนวันที่ 1 ของเดือน */
  day: number | null
  dateIso: string | null
  isPast: boolean
  isToday: boolean
  /** จำนวนเคสของเราที่จัดไว้วันนั้น (badge มุมขวาบน — `41` §7.4) */
  count: number
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function toDateIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

interface IsoParts {
  year: number
  month: number
  day: number
}

/** แตก `YYYY-MM-DD` เป็นตัวเลข — ค่าที่อ่านไม่ได้ตกเป็น 0 (caller ส่งค่าจาก DTO ที่ validate แล้วเสมอ) */
function parseIso(dateIso: string): IsoParts {
  const [year = 0, month = 0, day = 0] = dateIso.split('-').map(Number)
  return { year, month, day }
}

/** เลขวันในสัปดาห์ (0 = อาทิตย์) ของวันที่ ISO — คำนวณบน UTC เพื่อไม่ให้เขตเวลาเครื่องมีผล */
export function weekdayIndex(dateIso: string): number {
  const { year, month, day } = parseIso(dateIso)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** เลื่อนเดือนก่อน/หลัง (`41` §7.4 ปุ่มลูกศรหัวปฏิทิน) */
export function shiftMonth(current: CalendarMonth, delta: number): CalendarMonth {
  const zeroBased = current.year * 12 + (current.month - 1) + delta
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 }
}

/** เดือนของวันที่ ISO — ใช้ตั้งค่าเริ่มต้นของปฏิทิน (เดือนปัจจุบัน) */
export function monthOf(dateIso: string): CalendarMonth {
  const { year, month } = parseIso(dateIso)
  return { year, month }
}

/** หัวปฏิทิน เช่น `สิงหาคม 2569` — **พ.ศ. เท่านั้น** (Rule 01) */
export function monthLabelTH(current: CalendarMonth): string {
  const name = MONTH_NAMES_TH[current.month - 1] ?? ''
  return `${name} ${current.year + BUDDHIST_YEAR_OFFSET}`
}

/** จำนวนเคสที่จัดไว้ต่อวัน (`41` §7.4 badge) — นับเฉพาะเคสที่มีวันลงพื้นที่แล้ว */
export function countCasesByDate(items: readonly FieldCaseListItemDto[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    if (item.scheduleDate === null) continue
    counts[item.scheduleDate] = (counts[item.scheduleDate] ?? 0) + 1
  }
  return counts
}

/**
 * ช่องทั้งหมดของเดือน (รวมช่องว่างต้นสัปดาห์) — วันก่อนวันนี้ `isPast = true` ⇒ หน้าจอ disable
 * (`41` §7.4 "วันที่ผ่านไปแล้วกดไม่ได้" — BE ไม่บล็อกวันย้อนหลัง กฎนี้อยู่ที่ UI เท่านั้น)
 */
export function buildMonthGrid(input: {
  current: CalendarMonth
  todayIso: string
  countByDate?: Readonly<Record<string, number>>
}): CalendarCell[] {
  const { year, month } = input.current
  const counts = input.countByDate ?? {}
  const leading = weekdayIndex(toDateIso(year, month, 1))
  const total = daysInMonth(year, month)

  const cells: CalendarCell[] = []
  for (let index = 0; index < leading; index += 1) {
    cells.push({ day: null, dateIso: null, isPast: false, isToday: false, count: 0 })
  }
  for (let day = 1; day <= total; day += 1) {
    const dateIso = toDateIso(year, month, day)
    cells.push({
      day,
      dateIso,
      isPast: dateIso < input.todayIso,
      isToday: dateIso === input.todayIso,
      count: counts[dateIso] ?? 0,
    })
  }
  return cells
}

/**
 * ป้ายวันแบบมีชื่อวัน เช่น `วันพฤ 14/08/2569` (`41` §7.5 หัว section ต่อวัน)
 * ส่วนวันที่ใช้ `fmtDate` ที่ caller ส่งเข้ามา — **ห้าม format วันที่เองที่นี่** (Rule 01)
 */
export function withWeekdayPrefix(dateIso: string, formattedDate: string): string {
  const weekday = WEEKDAY_LABELS_TH[weekdayIndex(dateIso)] ?? ''
  return `วัน${weekday} ${formattedDate}`
}
