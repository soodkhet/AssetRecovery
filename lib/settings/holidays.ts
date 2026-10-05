/**
 * ปฏิทินวันหยุดขององค์กร (มติ PO 06/10/2569 UAT U93 · `13` §6.15) — ชั้น **pure** (ใช้ร่วม FE/BE)
 *
 * - เก็บวันที่แบบ date-only (`YYYY-MM-DD` ค.ศ. — คอลัมน์ `DATE`) · แสดงผลเป็น พ.ศ. ผ่าน `fmtDate()` เสมอ
 * - ตัวแยกข้อความนำเข้าหลายวัน: 1 บรรทัด = `YYYY-MM-DD,ชื่อวันหยุด` (คั่นด้วย comma หรือ tab · ไฟล์ CSV ง่าย ๆ)
 *   ปีกรอกเป็น พ.ศ. ได้ (ปี ≥ 2400 ถูกแปลง −543 ให้) · บรรทัดว่าง/ขึ้นต้นด้วย `#`/หัวตารางถูกข้าม
 * - ไม่ seed วันหยุดจริง — ผู้ใช้กรอกเองปีละครั้ง (มติ U93)
 */

/** จำนวนแถวสูงสุดต่อการนำเข้า 1 ครั้ง — วันหยุดราชการ + ชดเชยทั้งปีไม่เกินนี้แน่นอน */
export const MAX_HOLIDAY_IMPORT_ROWS = 100
export const MAX_HOLIDAY_NAME_LENGTH = 120

const BUDDHIST_ERA_OFFSET = 543
const BUDDHIST_YEAR_THRESHOLD = 2400

const WEEKDAY_LABEL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const

export interface HolidayImportItem {
  /** `YYYY-MM-DD` ค.ศ. */
  holidayDate: string
  name: string
}

export interface HolidayImportError {
  /** เลขบรรทัด (เริ่มที่ 1) ของข้อความที่วาง */
  line: number
  message: string
}

export interface HolidayImportParseResult {
  items: HolidayImportItem[]
  errors: HolidayImportError[]
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * แปลงวันที่ `YYYY-MM-DD` (ค.ศ. หรือ พ.ศ.) เป็นคีย์ ค.ศ. — `null` = รูปแบบผิด/ไม่มีวันนี้จริง
 * รับ `/` แทน `-` ได้ด้วย (`2569/12/31`) เพราะผู้ใช้มักพิมพ์ตามที่เห็นบนจอ
 */
export function normalizeHolidayDate(raw: string): string | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw.trim())
  if (match === null) return null
  let year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year >= BUDDHIST_YEAR_THRESHOLD) year -= BUDDHIST_ERA_OFFSET
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** บรรทัดหัวตาราง เช่น `date,name` / `วันที่,ชื่อ` — ไม่มีตัวเลขเลย */
function isHeaderLine(line: string): boolean {
  return !/\d/.test(line)
}

/** แยกข้อความที่วาง/ไฟล์ CSV เป็นรายการวันหยุด — คืนทั้งรายการที่ใช้ได้และข้อผิดพลาดรายบรรทัด */
export function parseHolidayImport(text: string): HolidayImportParseResult {
  const items: HolidayImportItem[] = []
  const errors: HolidayImportError[] = []
  const seen = new Map<string, number>()

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/^﻿/, '').trim()
    const lineNo = index + 1
    if (line === '' || line.startsWith('#')) return
    if (index === 0 && isHeaderLine(line)) return

    const separator = line.includes('\t') ? '\t' : ','
    const cut = line.indexOf(separator)
    const rawDate = cut === -1 ? line : line.slice(0, cut)
    const name = (cut === -1 ? '' : line.slice(cut + 1)).trim().replace(/^"(.*)"$/, '$1').trim()

    const holidayDate = normalizeHolidayDate(rawDate.replace(/^"(.*)"$/, '$1'))
    if (holidayDate === null) {
      errors.push({ line: lineNo, message: `วันที่ "${rawDate.trim()}" ไม่ถูกต้อง — ใช้รูปแบบ ปี-เดือน-วัน เช่น 2026-12-31` })
      return
    }
    if (name === '') {
      errors.push({ line: lineNo, message: 'ไม่มีชื่อวันหยุด — ใส่ชื่อหลังเครื่องหมายจุลภาค' })
      return
    }
    if (name.length > MAX_HOLIDAY_NAME_LENGTH) {
      errors.push({ line: lineNo, message: `ชื่อวันหยุดยาวเกิน ${MAX_HOLIDAY_NAME_LENGTH} ตัวอักษร` })
      return
    }
    const duplicateOf = seen.get(holidayDate)
    if (duplicateOf !== undefined) {
      errors.push({ line: lineNo, message: `วันที่ซ้ำกับบรรทัดที่ ${duplicateOf}` })
      return
    }
    seen.set(holidayDate, lineNo)
    items.push({ holidayDate, name })
  })

  if (items.length > MAX_HOLIDAY_IMPORT_ROWS) {
    errors.push({ line: 0, message: `นำเข้าได้ครั้งละไม่เกิน ${MAX_HOLIDAY_IMPORT_ROWS} วัน` })
  }
  return { items, errors }
}

/** ปี พ.ศ. ของคีย์วันที่ `YYYY-MM-DD` — ใช้จัดกลุ่มรายการตามปี */
export function holidayYearBe(holidayDate: string): number {
  return Number(holidayDate.slice(0, 4)) + BUDDHIST_ERA_OFFSET
}

/** ช่วงวันที่ (ค.ศ. date-only) ของปี พ.ศ. หนึ่ง — ใช้กรองรายการ */
export function holidayYearRange(yearBe: number): { from: Date; to: Date } {
  const yearCe = yearBe - BUDDHIST_ERA_OFFSET
  return { from: new Date(Date.UTC(yearCe, 0, 1)), to: new Date(Date.UTC(yearCe, 11, 31)) }
}

/** ชื่อวันในสัปดาห์ของคีย์วันที่ — "จันทร์" ฯลฯ */
export function holidayWeekdayLabel(holidayDate: string): string {
  const [year = 0, month = 1, day = 1] = holidayDate.split('-').map(Number)
  return WEEKDAY_LABEL[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? ''
}
