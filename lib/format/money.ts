/**
 * Money display utils (`02` §2.2 · `22` · Rule 01)
 *
 * - เงินในระบบเป็น **`INTEGER` satang เท่านั้น** (฿100.50 → `10050`) — ที่นี่ทำแค่ "แปลงเป็นข้อความ"
 * - **ห้ามคำนวณเงินฝั่ง display** — ทุกสูตรอยู่ pure module ของ `22` (Phase 3.1) แล้วส่งผลลัพธ์ที่เป็น satang มาแสดง
 * - รับค่าไม่ใช่จำนวนเต็ม = โยน error ทันที (ดักบั๊ก float ที่หลุดเข้ามาให้เจอตั้งแต่หน้าจอ dev)
 */

/** ค่าที่แสดงเมื่อไม่มีตัวเลข */
export const EMPTY_AMOUNT_DISPLAY = '—'

/** สัญลักษณ์เงินบาทที่ใช้ทั้งระบบ */
export const BAHT_SYMBOL = '฿'

export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyFormatError'
  }
}

function assertSatang(satang: number): void {
  if (!Number.isFinite(satang) || !Number.isInteger(satang)) {
    throw new MoneyFormatError(
      `จำนวนเงินต้องเป็นจำนวนเต็มหน่วยสตางค์ (INTEGER satang) — ได้รับ ${String(satang)}`,
    )
  }
}

const groupFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const integerFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * `10050` → `"100.50"` (มี comma คั่นหลักพัน) — ไม่มีสัญลักษณ์สกุลเงิน
 * @param satang จำนวนเต็มหน่วยสตางค์
 */
export function fmtSatang(satang: number | null | undefined, fallback = EMPTY_AMOUNT_DISPLAY): string {
  if (satang === null || satang === undefined) return fallback
  assertSatang(satang)
  // หาร 100 เพื่อ "แสดงผล" เท่านั้น — ไม่ใช่การคำนวณเงิน (ผลลัพธ์ไม่ถูกนำไปคิดต่อ)
  const sign = satang < 0 ? '-' : ''
  const absolute = Math.abs(satang)
  const baht = Math.trunc(absolute / 100)
  const cents = absolute % 100
  return `${sign}${integerFormatter.format(baht)}.${String(cents).padStart(2, '0')}`
}

/** `10050` → `"฿100.50"` */
export function fmtSatangSymbol(satang: number | null | undefined, fallback = EMPTY_AMOUNT_DISPLAY): string {
  if (satang === null || satang === undefined) return fallback
  return `${BAHT_SYMBOL}${fmtSatang(satang)}`
}

/** `10050` → `"100"` — ใช้เฉพาะที่ mockup แสดงยอดกลม (KPI card) เท่านั้น ห้ามใช้กับยอดที่ต้องกระทบยอด */
export function fmtSatangRounded(satang: number | null | undefined, fallback = EMPTY_AMOUNT_DISPLAY): string {
  if (satang === null || satang === undefined) return fallback
  assertSatang(satang)
  return integerFormatter.format(Math.round(satang / 100))
}

/** จำนวนทั่วไป (ไม่ใช่เงิน) พร้อม comma — เช่น จำนวนเคส/จำนวนเครื่อง */
export function fmtCount(value: number | null | undefined, fallback = EMPTY_AMOUNT_DISPLAY): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback
  return integerFormatter.format(value)
}

/**
 * เปอร์เซ็นต์จาก `NUMERIC(5,2)` (`rate_pct` / `wht_pct` — ข้อยกเว้นเดียวที่ไม่ใช่ satang)
 * รับ `string` ได้ตรง ๆ เพราะ Prisma `Decimal` ถูก serialize เป็น string เมื่อส่งผ่าน API
 */
export function fmtPercent(value: number | string | null | undefined, fallback = EMPTY_AMOUNT_DISPLAY): string {
  if (value === null || value === undefined || value === '') return fallback
  const numeric = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numeric)) return fallback
  return `${groupFormatter.format(numeric)}%`
}

/**
 * อัตราส่วนที่ **คำนวณมาแล้ว** จาก pure module ของ `22` (เช่น gross margin %) → ข้อความ
 * `null` = คำนวณไม่ได้ (เช่น `revenue = 0` ซึ่งห้ามหารศูนย์ — Rule 01) → แสดง `"N/A"`
 *
 * ⚠️ ที่นี่ไม่คำนวณสูตรใด ๆ เอง — สูตรทุกตัวอยู่ `docs/22` (pure module Phase 3.1) เท่านั้น
 */
export function fmtRatioPct(value: number | null | undefined, fallback = 'N/A'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback
  return `${groupFormatter.format(value)}%`
}

/**
 * ช่องกรอกเงินในฟอร์มรับเป็น **บาท** แต่ระบบเก็บเป็น **สตางค์** — ตัวแปลงสองทางอยู่ที่นี่ที่เดียว
 * (Rule 01: ห้ามให้แต่ละหน้าจอคูณ/หาร 100 เอง — พลาดที่เดียวคือเงินผิดทั้งโมดูล)
 */

/** `10050` → `"100.50"` สำหรับใส่ใน `<input type="number">` · `null` → `''` */
export function toBahtInput(satang: number | null | undefined): string {
  if (satang === null || satang === undefined) return ''
  assertSatang(satang)
  return (satang / 100).toFixed(2)
}

/**
 * `"100.50"` → `10050` — คืน `null` เมื่อช่องว่าง (แปลว่า "ไม่กำหนด" เช่นเพดานไม่จำกัด)
 * และคืน `NaN` เมื่อกรอกค่าที่ไม่ใช่ตัวเลข เพื่อให้ชั้นฟอร์มเลือกวิธีแจ้งเตือนเอง
 */
export function parseBahtInput(value: string): number | null | typeof NaN {
  const trimmed = value.trim().replace(/,/g, '')
  if (trimmed === '') return null
  const baht = Number(trimmed)
  if (!Number.isFinite(baht)) return Number.NaN
  return Math.round(baht * 100)
}
