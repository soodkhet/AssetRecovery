/**
 * Logic ล้วนของแผนค่าตอบแทน (ไฟล์ 11) — **ห้าม import อะไรที่แตะ Prisma/DB ในไฟล์นี้**
 * (กับดักใน REUSE_INDEX: ไฟล์ที่ import `lib/prisma` เทสต์ไม่ได้ถ้าไม่มี DB)
 *
 * ขอบเขต: normalize ค่าตามโหมดน้ำมัน · diff เพื่อตัดสินว่าต้องขึ้นเวอร์ชันใหม่ไหม ·
 * resolver ที่เลือกเวอร์ชันที่มีผล ณ วันหนึ่ง (สำหรับ snapshot ลง `expenses` ตาม `92` §7.1)
 *
 * ⚠️ **สูตรคำนวณเงินไม่ได้อยู่ที่นี่** — ค่าน้ำมัน/เบี้ยเลี้ยง/คอมมิชชั่นคำนวณตาม `22` §6.1–6.4
 * เป็น pure module ของ Phase 3.1 ไฟล์นี้เก็บแค่ "อัตราที่ตั้งไว้" ไม่คูณอะไรทั้งสิ้น
 */

export type FuelMode = 'PER_KM' | 'DAILY_FLAT'
export type TeamSide = 'inhouse' | 'outsource'

/** ค่าที่ผู้ใช้ตั้งได้ต่อแผน 1 เวอร์ชัน — ตรงกับคอลัมน์ `compensation_plans` (`02` §5) */
export interface CompensationPlanValues {
  name: string
  side: TeamSide
  fuelMode: FuelMode
  fuelRatePerKmSatang: number | null
  fuelMaxPerCaseSatang: number | null
  fuelDailyFlatSatang: number | null
  allowanceSatang: number
  commissionSatang: number
  noSuccessFeeSatang: number
  hotelMaxPerNightSatang: number | null
  hotelReceiptRequired: boolean
  whtPct: number
  /** ISO ค.ศ. `YYYY-MM-DD` — คอลัมน์ DB เป็น DATE (แสดงผลเป็น พ.ศ. ที่ชั้น UI เท่านั้น) */
  effectiveFrom: string
}

/** แถวหนึ่งเวอร์ชันจาก DB (แปลง Decimal/Date เป็นค่าธรรมดาแล้ว) */
export interface CompensationPlanVersion extends CompensationPlanValues {
  id: string
  version: number
  effectiveTo: string | null
  isCurrent: boolean
}

const VALUE_FIELDS = [
  'name',
  'side',
  'fuelMode',
  'fuelRatePerKmSatang',
  'fuelMaxPerCaseSatang',
  'fuelDailyFlatSatang',
  'allowanceSatang',
  'commissionSatang',
  'noSuccessFeeSatang',
  'hotelMaxPerNightSatang',
  'hotelReceiptRequired',
  'whtPct',
  'effectiveFrom',
] as const satisfies readonly (keyof CompensationPlanValues)[]

/**
 * บังคับความ exclusive ของโหมดน้ำมันในระดับข้อมูล (`11` §7.1)
 * schema ปฏิเสธค่าของอีกโหมดอยู่แล้ว — ตัวนี้กันเคสที่ค่ามาจากทางอื่น (import/seed) ไม่ให้ค้างใน DB
 */
export function normalizePlanValues(values: CompensationPlanValues): CompensationPlanValues {
  if (values.fuelMode === 'PER_KM') {
    return { ...values, fuelDailyFlatSatang: null }
  }
  return { ...values, fuelRatePerKmSatang: null, fuelMaxPerCaseSatang: null }
}

/** ชื่อฟิลด์ที่ค่าต่างกันจริง — ว่าง = ไม่มีอะไรเปลี่ยน ไม่ต้องขึ้นเวอร์ชันใหม่ */
export function diffPlanValues(
  current: CompensationPlanValues,
  next: CompensationPlanValues,
): (keyof CompensationPlanValues)[] {
  const before = normalizePlanValues(current)
  const after = normalizePlanValues(next)
  return VALUE_FIELDS.filter((field) => before[field] !== after[field])
}

export interface NextVersionPlan {
  /** ค่าของเวอร์ชันใหม่ (normalize แล้ว) */
  values: CompensationPlanValues
  version: number
  /** วันสุดท้ายที่เวอร์ชันเดิมมีผล = วันก่อน `effective_from` ของเวอร์ชันใหม่ · null = เริ่มมีผลวันเดียวกัน */
  previousEffectiveTo: string | null
  changedFields: (keyof CompensationPlanValues)[]
}

/**
 * วางแผนการขึ้นเวอร์ชันจาก PATCH (`11` §10/§14 — แก้แล้วต้อง version ไม่ overwrite ของเดิม)
 * คืน `null` เมื่อไม่มีฟิลด์ไหนเปลี่ยน (กันเวอร์ชันขยะจากการกดบันทึกซ้ำ)
 */
export function planNextVersion(
  current: CompensationPlanVersion,
  next: CompensationPlanValues,
): NextVersionPlan | null {
  const changedFields = diffPlanValues(current, next)
  if (changedFields.length === 0) return null

  return {
    values: normalizePlanValues(next),
    version: current.version + 1,
    previousEffectiveTo: previousDay(next.effectiveFrom, current.effectiveFrom),
    changedFields,
  }
}

/**
 * เวอร์ชันเดิมหมดผลก่อนวันที่เวอร์ชันใหม่เริ่ม — ถ้าเวอร์ชันใหม่เริ่มวันเดียวกับ (หรือก่อน) ของเดิม
 * จะไม่มีช่วงเวลาให้ปิด คืน `null` แล้วปล่อยให้ `is_current` เป็นตัวชี้ขาดแทน
 */
function previousDay(nextEffectiveFrom: string, currentEffectiveFrom: string): string | null {
  if (nextEffectiveFrom <= currentEffectiveFrom) return null
  const date = new Date(`${nextEffectiveFrom}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/**
 * **Snapshot resolver** — เลือกเวอร์ชันที่มีผล ณ วันที่กำหนด (ISO `YYYY-MM-DD`)
 * ใช้ตอนบันทึก `expenses.comp_plan_id` + `comp_plan_version` (`92` §7.1) — ห้ามอ่านเวอร์ชันปัจจุบัน
 * มาคำนวณย้อนหลัง เพราะแผนอาจถูกแก้ไปแล้วหลังเคสจบ
 */
export function resolvePlanVersionAt(
  versions: readonly CompensationPlanVersion[],
  onDate: string,
): CompensationPlanVersion | null {
  const effective = versions.filter(
    (version) => version.effectiveFrom <= onDate && (version.effectiveTo === null || version.effectiveTo >= onDate),
  )
  if (effective.length === 0) return null
  return effective.reduce((latest, version) => (version.version > latest.version ? version : latest))
}

/** เวอร์ชันปัจจุบันของแผน (`is_current`) — ไม่มี = แผนถูกปิดใช้งานหรือข้อมูลผิดรูป */
export function pickCurrentPlanVersion(
  versions: readonly CompensationPlanVersion[],
): CompensationPlanVersion | null {
  return versions.find((version) => version.isCurrent) ?? null
}

/** ค่าที่ต้อง snapshot ลงรายการค่าใช้จ่าย (`92` §7.1 · `02` Group E `expenses`) */
export interface CompensationSnapshot {
  compPlanId: string
  compPlanVersion: number
}

export function toCompensationSnapshot(plan: CompensationPlanVersion): CompensationSnapshot {
  return { compPlanId: plan.id, compPlanVersion: plan.version }
}

/** คำอธิบายกติกาค่าน้ำมันสำหรับ UI — โครงสร้างล้วน ให้ชั้น display จัดรูปเงินเอง (Rule 01) */
export type FuelRuleDescription =
  | { mode: 'PER_KM'; ratePerKmSatang: number; maxPerCaseSatang: number | null }
  | { mode: 'DAILY_FLAT'; dailyFlatSatang: number }

export function describeFuelRule(
  plan: Pick<
    CompensationPlanValues,
    'fuelMode' | 'fuelRatePerKmSatang' | 'fuelMaxPerCaseSatang' | 'fuelDailyFlatSatang'
  >,
): FuelRuleDescription {
  if (plan.fuelMode === 'PER_KM') {
    return {
      mode: 'PER_KM',
      ratePerKmSatang: plan.fuelRatePerKmSatang ?? 0,
      maxPerCaseSatang: plan.fuelMaxPerCaseSatang,
    }
  }
  return { mode: 'DAILY_FLAT', dailyFlatSatang: plan.fuelDailyFlatSatang ?? 0 }
}
