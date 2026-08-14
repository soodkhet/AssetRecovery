import { BUDDHIST_YEAR_OFFSET, DISPLAY_TIMEZONE } from '@/lib/constants'

/**
 * Datetime utils กลางของทั้งระบบ (`03` §6.5 · `04` §8 · DEC-005 · Rule 01)
 *
 * - **Storage/API = UTC เสมอ** — ที่นี่ทำหน้าที่แปลงเป็น Asia/Bangkok ตอนแสดงผลเท่านั้น
 * - **Display = พ.ศ. เท่านั้น** (ค.ศ. + 543) format `DD/MM/YYYY [HH:mm]` separator `/` เท่านั้น
 * - ข้อยกเว้นเดียวที่ใช้ ค.ศ. บนหน้าจอ = `<input type="date">` → ใช้ `toInputDate()` / `fromInputDate()`
 *
 * ⚠️ ห้าม format วันที่เองในโมดูลอื่น — แสดง ค.ศ. บนหน้าจอ = bug (`DISPLAY_CE_YEAR`, `04` §16)
 */

export type DateInput = Date | string | number

/** ค่าที่แสดงเมื่อไม่มีวันที่/วันที่ไม่ถูกต้อง — ใช้ค่าเดียวกันทั้งระบบ */
export const EMPTY_DATE_DISPLAY = '—'

/**
 * ไทยใช้ UTC+7 คงที่ (ไม่มี DST ตั้งแต่ปี 2519) — ใช้ตอนแปลงค่าจาก `<input type="date">` กลับเป็น instant
 * ส่วนการ "อ่าน" เวลาเพื่อแสดงผลใช้ `Intl` เสมอ (ไม่ hardcode offset)
 */
const BANGKOK_UTC_OFFSET = '+07:00'

const bangkokParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export interface BangkokDateParts {
  /** ปี ค.ศ. (ยังไม่บวก 543) */
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** แปลง input เป็น `Date` — คืน `null` เมื่อค่าว่าง/ไม่ใช่วันที่ที่ใช้ได้ (caller ตัดสินใจว่าจะแสดงอะไรแทน) */
export function toDate(input: DateInput | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

/** แตกส่วนประกอบวันเวลาตามเขตเวลา Asia/Bangkok (ปียังเป็น ค.ศ.) */
export function toBangkokParts(input: DateInput): BangkokDateParts | null {
  const date = toDate(input)
  if (date === null) return null

  const parts = bangkokParts.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value
    return value === undefined ? Number.NaN : Number(value)
  }

  const result: BangkokDateParts = {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
  return Object.values(result).some(Number.isNaN) ? null : result
}

/** ปี พ.ศ. ของ instant นั้นตามเวลาไทย — ใช้กับเลขเอกสาร `LOT-YYYY-XXX` / `DLV-YYYY-XXX` ด้วย (Rule 01) */
export function buddhistYear(input: DateInput): number | null {
  const parts = toBangkokParts(input)
  return parts === null ? null : parts.year + BUDDHIST_YEAR_OFFSET
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `DD/MM/YYYY` พ.ศ. เวลาไทย — เช่น `02/07/2569` */
export function fmtDate(input: DateInput | null | undefined, fallback = EMPTY_DATE_DISPLAY): string {
  const parts = input === null || input === undefined ? null : toBangkokParts(input)
  if (parts === null) return fallback
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year + BUDDHIST_YEAR_OFFSET}`
}

/** `DD/MM/YYYY HH:mm` พ.ศ. เวลาไทย — เช่น `02/07/2569 14:30` */
export function fmtDateTime(input: DateInput | null | undefined, fallback = EMPTY_DATE_DISPLAY): string {
  const parts = input === null || input === undefined ? null : toBangkokParts(input)
  if (parts === null) return fallback
  return `${fmtDate(input, fallback)} ${pad2(parts.hour)}:${pad2(parts.minute)}`
}

/** `HH:mm` เวลาไทย */
export function fmtTime(input: DateInput | null | undefined, fallback = EMPTY_DATE_DISPLAY): string {
  const parts = input === null || input === undefined ? null : toBangkokParts(input)
  if (parts === null) return fallback
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`
}

/** วันที่ปัจจุบันแบบ `DD/MM/YYYY` พ.ศ. (`nowDate()` ตาม Rule 01) */
export function nowDate(now: Date = new Date()): string {
  return fmtDate(now)
}

/** วันเวลาปัจจุบันแบบ `DD/MM/YYYY HH:mm` พ.ศ. */
export function nowDateTime(now: Date = new Date()): string {
  return fmtDateTime(now)
}

/**
 * ค่า `value` ของ `<input type="date">` — **ISO ค.ศ. `YYYY-MM-DD`** (browser บังคับ — ข้อยกเว้นเดียวของกฎ พ.ศ.)
 * อิงวันตามเวลาไทย ไม่ใช่ UTC (มิฉะนั้นเวลาหลัง 17:00 น. ไทยจะเพี้ยนไปหนึ่งวัน)
 */
export function toInputDate(input: DateInput | null | undefined, fallback = ''): string {
  const parts = input === null || input === undefined ? null : toBangkokParts(input)
  if (parts === null) return fallback
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

/**
 * แปลงค่าจาก `<input type="date">` (`YYYY-MM-DD` ค.ศ.) กลับเป็น instant UTC
 * = เที่ยงคืนของวันนั้นตามเวลาไทย — ค่าที่ส่งขึ้น API/เก็บ DB ต้องเป็น UTC เสมอ
 */
export function fromInputDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00${BANGKOK_UTC_OFFSET}`)
  return Number.isNaN(date.getTime()) ? null : date
}
