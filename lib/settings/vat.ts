import { toBangkokParts } from '@/lib/format/datetime'

/**
 * อัตรา VAT แบบ effective-dated (`13` §6.5 · `19` §6.3) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * กติกาเหล็ก (Rule 01): **ห้าม hardcode 7%** ทุกจุดที่ต้องใช้อัตรา VAT ต้อง resolve จาก
 * `vat_rate_history` ตามวันที่ของรายการ แล้ว snapshot ค่าที่ได้ลง record (`revenues.vat_rate_used`)
 *
 * ช่วงเวลาเป็นแบบ **inclusive ทั้งสองด้าน** (`effective_from` ≤ วันที่ ≤ `effective_to`)
 * และ `effective_to = null` แปลว่า "ยังใช้อยู่จนกว่าจะปิดช่วง" — ห้ามมีช่วงทับกัน (`VAT_RATE_OVERLAP`)
 *
 * เทียบวันที่แบบ **date-only** เสมอ: คอลัมน์เป็น `DATE` ไม่ใช่ `TIMESTAMPTZ` จึงต้องตัดเวลาทิ้ง
 * ก่อนเทียบ ไม่งั้นรายการที่เกิดตอนเย็นตามเวลาไทยจะหลุดช่วงเพราะ UTC offset
 */

export interface VatRatePeriod {
  id: string
  /** % เช่น 7.00 — ส่งเป็น string ได้ (Prisma `Decimal` แปลงเป็น string ตอนออก API) */
  ratePct: number
  effectiveFrom: Date
  effectiveTo: Date | null
}

/** จำนวนวันนับจาก epoch ตามปฏิทิน UTC — ใช้กับ **ค่าที่มาจากคอลัมน์ `DATE`** (เที่ยงคืน UTC) */
export function toDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
}

/**
 * จำนวนวันของ **วันตามปฏิทินกรุงเทพ** — ใช้กับ "วันที่ของรายการ" ที่อาจเป็น instant (`TIMESTAMPTZ`)
 *
 * ⚠️ จุดพลาดที่ทำให้ VAT ผิดวัน: `revenue_date` ที่เป็น instant ตอน 20:00Z คือวันถัดไปตามเวลาไทย
 * ถ้าเทียบด้วยปฏิทิน UTC จะได้อัตราของวันก่อนหน้า — รอยต่อ 30/09 → 01/10 (7% → 10%) จึงเพี้ยน
 * ส่วนขอบของช่วง (`effective_from`/`effective_to`) เป็นคอลัมน์ `DATE` ต้องใช้ `toDayNumber()` เสมอ
 */
export function toBangkokDayNumber(date: Date): number {
  const parts = toBangkokParts(date)
  if (parts === null) throw new Error('toBangkokDayNumber: วันที่ไม่ถูกต้อง')
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000)
}

/** ช่วง `[from, to]` เป็นวัน — `to = null` → `Infinity` (เปิดปลาย) */
function rangeOf(period: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>): { from: number; to: number } {
  return {
    from: toDayNumber(period.effectiveFrom),
    to: period.effectiveTo === null ? Number.POSITIVE_INFINITY : toDayNumber(period.effectiveTo),
  }
}

/** ช่วงเวลาถูกต้องหรือไม่ (`effective_to` ต้องไม่มาก่อน `effective_from`) */
export function isPeriodRangeValid(period: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>): boolean {
  const range = rangeOf(period)
  return range.to >= range.from
}

/** ช่วงสองช่วงทับกันหรือไม่ (inclusive ทั้งสองด้าน) */
export function periodsOverlap(
  a: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>,
  b: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>,
): boolean {
  const first = rangeOf(a)
  const second = rangeOf(b)
  return first.from <= second.to && second.from <= first.to
}

/**
 * หารายการที่ช่วงทับกับช่วงใหม่ (`VAT_RATE_OVERLAP` — `13` §10)
 * `exceptId` ใช้ตอน PATCH ปิดช่วงของตัวเอง (ไม่นับตัวเองเป็นคู่ทับ)
 */
export function findOverlappingPeriods(
  candidate: Pick<VatRatePeriod, 'effectiveFrom' | 'effectiveTo'>,
  existing: readonly VatRatePeriod[],
  exceptId?: string,
): VatRatePeriod[] {
  return existing.filter((period) => period.id !== exceptId && periodsOverlap(candidate, period))
}

/**
 * อัตราที่มีผล ณ วันที่หนึ่ง — `null` = ไม่มีช่วงครอบคลุม (`VAT_RATE_NOT_FOUND`)
 * ถ้ามีหลายช่วงครอบคลุม (ไม่ควรเกิดเพราะกันทับไว้แล้ว) เลือกช่วงที่ `effective_from` ใหม่สุด
 */
export function resolveVatRateAt(date: Date, periods: readonly VatRatePeriod[]): VatRatePeriod | null {
  const day = toDayNumber(date)
  const matches = periods.filter((period) => {
    const range = rangeOf(period)
    return range.from <= day && day <= range.to
  })
  if (matches.length === 0) return null
  return matches.reduce((latest, period) =>
    toDayNumber(period.effectiveFrom) > toDayNumber(latest.effectiveFrom) ? period : latest,
  )
}

/** เรียงจากช่วงใหม่สุดไปเก่าสุด — ใช้ทั้ง timeline บน UI และผลลัพธ์ API */
export function sortPeriodsDesc<T extends Pick<VatRatePeriod, 'effectiveFrom'>>(periods: readonly T[]): T[] {
  return [...periods].sort((a, b) => toDayNumber(b.effectiveFrom) - toDayNumber(a.effectiveFrom))
}

/** ช่วงที่ยังเปิดปลาย (ยังใช้อยู่) — FE เตือนให้ปิดช่วงก่อนเพิ่มอัตราใหม่ */
export function openEndedPeriod(periods: readonly VatRatePeriod[]): VatRatePeriod | null {
  return periods.find((period) => period.effectiveTo === null) ?? null
}
