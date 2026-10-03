import { assertNonNegativeSatang } from '@/lib/finance/satang'
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
  /** `22` §6.4 — จ่ายเมื่อ `closed_success` (มติ PO 03/10/2569 UAT Q2: สร้างเป็นรายการเบิกตอนปิดงาน) */
  commissionSatang: number
  /** `22` §6.4 — เบี้ยเสี่ยง จ่ายเมื่อ `closed_fail` — exclusive กับ commission */
  noSuccessFeeSatang: number
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

/**
 * `22` §6.2 — โหมด `DAILY_FLAT` = อัตราเหมาจ่าย (บาท/วัน) × จำนวนวันที่ลงพื้นที่จริง ไม่คำนวณระยะทางเลย
 * มติ PO 03/10/2569 (UAT Q4 · BUG-013): นับวันแบบเดียวกับเบี้ยเลี้ยง (`distinctFieldDays()` — วันปฏิทินไทย)
 * ตามหน่วย "บาท/วัน" ของ `11` · เดิมจ่ายคงที่ต่อเคส
 */
export function fuelDailyFlatSatang(dailyFlatSatang: number | null, fieldDays: number): number {
  if (fieldDays < 0 || !Number.isInteger(fieldDays)) throw new RangeError('จำนวนวันต้องเป็นจำนวนเต็มไม่ติดลบ')
  return (dailyFlatSatang ?? 0) * fieldDays
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

/** ค่าจากแผนค่าตอบแทนที่ **snapshot ไว้ในตัว expense แล้ว** (`92` §7.1) — ห้ามอ่าน live plan มาคิดย้อนหลัง */
export type CommissionPlanValues = Pick<CompensationSnapshotValues, 'commissionSatang' | 'noSuccessFeeSatang'>

export interface CommissionResult {
  /** ชนิดรายการเบิกที่ต้องสร้าง — `null` เมื่อยอดเป็น 0 (ยอด 0 ไม่สร้าง record ตาม D10) */
  expenseType: Extract<ExpenseType, 'commission' | 'no_success_fee'> | null
  grossSatang: number
}

/**
 * `22` §6.4 — ค่าตายตัวต่อเคสตาม outcome (**ไม่ใช่ % ของมูลหนี้** และ **ไม่มีการหารเฉลี่ยต่อวัน**
 * — "กฎหาร 4" ถูกยกเลิกแล้ว) · commission กับ no-success fee เป็น mutually exclusive เสมอ
 */
export function commissionSatang(outcome: CaseOutcome, plan: CommissionPlanValues): CommissionResult {
  assertNonNegativeSatang(plan.commissionSatang, 'commission')
  assertNonNegativeSatang(plan.noSuccessFeeSatang, 'no_success_fee')

  const grossSatang = outcome === 'closed_success' ? plan.commissionSatang : plan.noSuccessFeeSatang
  if (grossSatang === 0) return { expenseType: null, grossSatang: 0 }
  return {
    expenseType: outcome === 'closed_success' ? 'commission' : 'no_success_fee',
    grossSatang,
  }
}

/**
 * สถานะเริ่มต้นของรายการเบิกผูกเคส (`41` §6.6 กฎ "สถานะสำเร็จต้องรอคลังก่อน")
 * — `closed_success` เข้า `pending_warehouse_confirm` **เสมอ** ห้ามข้ามไป `pending_approval`
 */
export function initialCaseExpenseStatus(outcome: CaseOutcome): ExpenseStatus {
  return outcome === 'closed_success' ? 'pending_warehouse_confirm' : 'pending_approval'
}

/** ชนิดรายการเบิก "ผูกกับเคส" ที่ระบบสร้างเองตอนปิดงาน (`41` §6.6 + มติ PO 03/10/2569 UAT Q2) */
export type CaseBoundExpenseType = Extract<ExpenseType, 'fuel' | 'allowance' | 'commission' | 'no_success_fee'>

export interface CaseExpenseDraft {
  expenseType: CaseBoundExpenseType
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
 * รายการเบิกทั้งชุดของ 1 รอบติดตาม (fuel + allowance + commission/no_success_fee) — ใช้ทั้งตอน `submit_close_case` และ `resubmit_close_case`
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
    const gross = fuelDailyFlatSatang(input.plan.fuelDailyFlatSatang, input.fieldDays)
    if (gross > 0) drafts.push({ expenseType: 'fuel', grossSatang: gross, distanceKmHundredths: null, status })
  }

  const allowance = allowanceSatang(input.plan.allowanceSatang, input.fieldDays)
  if (allowance > 0) drafts.push({ expenseType: 'allowance', grossSatang: allowance, distanceKmHundredths: null, status })

  // `22` §6.4 + มติ PO 03/10/2569 (UAT Q2 · BUG-010) — ค่าคอมมิชชั่น (สำเร็จ) / เบี้ยเสี่ยง (ไม่สำเร็จ)
  // เป็นรายการเบิกผูกเคสอีกตัวในชุดเดียวกัน ⇒ สถานะเริ่มต้นกติกาเดียวกับ fuel/allowance
  // (สำเร็จต้องรอคลังก่อน) และเข้าอนุมัติ/รอบจ่ายตามปกติ · ยอด 0 ไม่สร้าง record (D10)
  const commission = commissionSatang(input.outcome, input.plan)
  if (commission.expenseType !== null) {
    drafts.push({ expenseType: commission.expenseType, grossSatang: commission.grossSatang, distanceKmHundredths: null, status })
  }

  return { drafts, fuelDistancePending }
}
