import { toBangkokParts } from '@/lib/format/datetime'
import type { CaseOutcome, ExpenseStatus, ExpenseType, FuelMode } from '@/lib/generated/prisma/enums'

/**
 * รายการเบิก "ผูกกับเคส" ที่ระบบสร้างอัตโนมัติตอนปิดงาน (`41` §6.6) — **pure ล้วน ไม่มี I/O**
 * สูตรทุกตัวมาจาก `22` §6.1–6.3 เท่านั้น (SSOT ของสูตรเงิน — ห้าม hardcode ซ้ำที่อื่น)
 *
 * - เงินเป็น **satang จำนวนเต็ม** ทุกขั้น (Rule 01) · ระยะทางเป็น "ร้อยของกิโลเมตร" จำนวนเต็ม
 * - ยอด 0 **ไม่สร้าง record** (มติ PO 14/08/2569 — D10 · เข้าเงื่อนไข "เคสไม่มี expense" DEC-006/D6)
 * - fuel โหมด `PER_KM` ที่ยังไม่รู้ระยะทาง (Maps ล่ม/ยังไม่มี key) = **ยังไม่สร้างแถว** แล้วให้ job
 *   `fuel_distance_retry` มาสร้างทีหลัง — ห้ามสร้างยอด 0 ค้างไว้ (D10)
 */

/** ค่าจากแผนค่าตอบแทน ณ เวลาปิดงาน (`11` §7.1) — snapshot มาแล้ว ห้ามอ่าน live template ซ้ำ */
export interface CompensationSnapshotValues {
  fuelMode: FuelMode
  fuelRatePerKmSatang: number | null
  fuelMaxPerCaseSatang: number | null
  fuelDailyFlatSatang: number | null
  allowanceSatang: number
}

/** `22` §6.1 — ยอดดิบ = ระยะทาง(กม.) × rate · ยอดจ่ายจริง = MIN(ยอดดิบ, เพดาน) ถ้าตั้งเพดานไว้ */
export function fuelPerKmSatang(input: {
  distanceKmHundredths: number
  ratePerKmSatang: number | null
  maxPerCaseSatang: number | null
}): number {
  const rate = input.ratePerKmSatang ?? 0
  if (input.distanceKmHundredths < 0) throw new RangeError('ระยะทางติดลบไม่ได้')
  if (!Number.isInteger(input.distanceKmHundredths)) throw new RangeError('ระยะทางต้องเป็นร้อยของกิโลเมตรจำนวนเต็ม')

  const raw = Math.round((input.distanceKmHundredths * rate) / 100)
  const cap = input.maxPerCaseSatang
  // เพดานที่ไม่ได้ตั้งไว้ = null หรือ 0 ⇒ จ่ายเต็มตามระยะทางจริง (`41` §6.4.2)
  if (cap === null || cap <= 0) return raw
  return Math.min(raw, cap)
}

/** `22` §6.2 — โหมด `DAILY_FLAT` จ่ายค่าคงที่ต่อเคส ไม่คำนวณระยะทางเลย */
export function fuelDailyFlatSatang(dailyFlatSatang: number | null): number {
  return dailyFlatSatang ?? 0
}

/** `22` §6.3 — เบี้ยเลี้ยง = อัตราต่อวัน × จำนวนวันที่ลงพื้นที่จริงของเคสนั้น */
export function allowanceSatang(ratePerDaySatang: number, fieldDays: number): number {
  if (fieldDays < 0 || !Number.isInteger(fieldDays)) throw new RangeError('จำนวนวันต้องเป็นจำนวนเต็มไม่ติดลบ')
  return ratePerDaySatang * fieldDays
}

/**
 * `22` §6.3 — จำนวนวันที่ลงพื้นที่จริง = COUNT(DISTINCT วันของ `check_ins` ของเคสนั้น)
 * **นับตามวันปฏิทินเวลาไทย** (Rule 01 · E7) — เช็คอิน 23:30 กับ 00:30 คนละวันเสมอ
 */
export function distinctFieldDays(checkedInAts: readonly Date[]): number {
  const days = new Set<string>()
  for (const at of checkedInAts) {
    const parts = toBangkokParts(at)
    if (parts === null) continue
    days.add(`${parts.year}-${parts.month}-${parts.day}`)
  }
  return days.size
}

/**
 * สถานะเริ่มต้นของรายการเบิกผูกเคส (`41` §6.6 กฎ "สถานะสำเร็จต้องรอคลังก่อน")
 * — `closed_success` เข้า `pending_warehouse_confirm` **เสมอ** ห้ามข้ามไป `pending_approval`
 */
export function initialCaseExpenseStatus(outcome: CaseOutcome): ExpenseStatus {
  return outcome === 'closed_success' ? 'pending_warehouse_confirm' : 'pending_approval'
}

export interface CaseExpenseDraft {
  expenseType: Extract<ExpenseType, 'fuel' | 'allowance'>
  grossSatang: number
  /** ร้อยของกิโลเมตร — null สำหรับ `DAILY_FLAT`/`allowance` (`41` §6.6) */
  distanceKmHundredths: number | null
  status: ExpenseStatus
}

export interface CaseExpenseInput {
  outcome: CaseOutcome
  plan: CompensationSnapshotValues
  /** ระยะทางที่คำนวณได้ — `null` = ยังคำนวณไม่ได้ (`PER_KM` เท่านั้น ⇒ ข้ามรายการ fuel ไว้ก่อน) */
  distanceKmHundredths: number | null
  /** จำนวนวันที่ลงพื้นที่จริงของเคสนั้น (`22` §6.3) */
  fieldDays: number
}

export interface CaseExpensePlan {
  drafts: CaseExpenseDraft[]
  /** true = ต้องตั้ง job `fuel_distance_retry` เพราะ fuel `PER_KM` ยังไม่ได้ระยะทาง (D10) */
  fuelDistancePending: boolean
}

/**
 * รายการเบิกทั้งชุดของ 1 รอบติดตาม — ใช้ทั้งตอน `submit_close_case` และ `resubmit_close_case`
 * (`41` §8 — resubmit สร้าง "ตามกฎปกติ" ชุดเดียวกัน จึงต้องเรียกฟังก์ชันนี้ตัวเดียวกันเสมอ)
 */
export function planCaseExpenses(input: CaseExpenseInput): CaseExpensePlan {
  const status = initialCaseExpenseStatus(input.outcome)
  const drafts: CaseExpenseDraft[] = []
  let fuelDistancePending = false

  if (input.plan.fuelMode === 'PER_KM') {
    if (input.distanceKmHundredths === null) {
      fuelDistancePending = true
    } else {
      const gross = fuelPerKmSatang({
        distanceKmHundredths: input.distanceKmHundredths,
        ratePerKmSatang: input.plan.fuelRatePerKmSatang,
        maxPerCaseSatang: input.plan.fuelMaxPerCaseSatang,
      })
      if (gross > 0) {
        drafts.push({ expenseType: 'fuel', grossSatang: gross, distanceKmHundredths: input.distanceKmHundredths, status })
      }
    }
  } else {
    const gross = fuelDailyFlatSatang(input.plan.fuelDailyFlatSatang)
    if (gross > 0) drafts.push({ expenseType: 'fuel', grossSatang: gross, distanceKmHundredths: null, status })
  }

  const allowance = allowanceSatang(input.plan.allowanceSatang, input.fieldDays)
  if (allowance > 0) drafts.push({ expenseType: 'allowance', grossSatang: allowance, distanceKmHundredths: null, status })

  return { drafts, fuelDistancePending }
}
