import type { ExpenseType, PayoutBatchSide } from '@/lib/generated/prisma/enums'
import { toBangkokDayNumber, toDayNumber } from '@/lib/settings/vat'

/**
 * ค่าตั้งภาษีหัก ณ ที่จ่าย 3 ตัว (`22` §6.9 · `13` §6.4.1 · `33` — มติ PO 05/10/2569 UAT U3/U4/U5/U7/U8)
 * **pure ล้วน ใช้ร่วม FE/BE**
 *
 * 1. **ฐาน WHT** (U3) — ชนิดรายการ (`expense_type`) ใดรวมในฐาน · ค่าเริ่มต้น = รายการเหมาจ่าย
 *    (คอมมิชชัน/เบี้ยเสี่ยง/น้ำมัน/เบี้ยเลี้ยง) รวม · ค่าที่พัก/เบิกตามใบเสร็จ/รายการกรอกเอง **ไม่รวม**
 *    (เงินคืนค่าใช้จ่ายที่จ่ายแทนบริษัทตามใบเสร็จไม่ใช่เงินได้ของผู้รับ) — รายการที่ไม่รวมยังจ่ายตามปกติ
 * 2. **การออก 50 ทวิ** (U4) — ต่อผู้รับต่อรอบจ่าย (ค่าเริ่มต้น) / ต่อรายการ (พฤติกรรมเดิม)
 * 3. **ประเภทเงินได้** (U5/U7) — 40(8) ทั้งหมด (ค่าเริ่มต้น) / 40(2) ทั้งหมด / แยกตามประเภททีม
 *    (inhouse = 40(2) · outsource = 40(8)) · 40(2) ใช้อัตราต่อคนจาก `payee_profiles.wht_40_2_pct`
 *    ไม่คำนวณอัตราก้าวหน้า (Hybrid Boundary — สำนักงานบัญชีคำนวณให้) · ยื่น ภ.ง.ด.1
 *
 * **effective-dated แบบ `vat_rate_history`** (U8): ตาราง `wht_policy_history` insert-only ·
 * รอบจ่ายใช้ค่าที่มีผล ณ วันที่สร้างรอบ (วันตามปฏิทินไทย) แล้ว **snapshot ลง `payout_batches`** —
 * เปลี่ยนค่าตั้งภายหลังไม่กระทบรอบเดิม (Rule 08 snapshot pattern)
 */

/** ค่าตรง enum `wht_certificate_mode` / `wht_income_type_mode` / `wht_income_category` ของ `02` §3 */
export const WHT_CERTIFICATE_MODES = ['per_payee_batch', 'per_item'] as const
export const WHT_INCOME_TYPE_MODES = ['all_40_8', 'all_40_2', 'by_team_side'] as const
export const WHT_INCOME_CATEGORIES = ['sec_40_8', 'sec_40_2'] as const

export type WhtCertificateMode = (typeof WHT_CERTIFICATE_MODES)[number]
export type WhtIncomeTypeMode = (typeof WHT_INCOME_TYPE_MODES)[number]
export type WhtIncomeCategory = (typeof WHT_INCOME_CATEGORIES)[number]

/** ชนิดรายการทั้งหมด เรียงตามที่แสดงบนหน้าตั้งค่า (ตรง enum `expense_type` ของ `02` §3) */
export const WHT_POLICY_EXPENSE_TYPES = [
  'commission',
  'no_success_fee',
  'fuel',
  'allowance',
  'hotel',
  'receipt',
  'manual',
] as const satisfies readonly ExpenseType[]

export interface WhtPolicyValues {
  /** ชนิดรายการที่รวมในฐาน WHT — ชนิดที่ไม่อยู่ในรายการนี้จ่ายตามปกติแต่ไม่หักภาษี */
  baseExpenseTypes: readonly ExpenseType[]
  certificateMode: WhtCertificateMode
  incomeTypeMode: WhtIncomeTypeMode
}

/** ค่าเริ่มต้นตามมติ (ใช้เมื่อองค์กรยังไม่เคยตั้งค่า — ไม่มีแถวใน `wht_policy_history`) */
export const DEFAULT_WHT_POLICY: WhtPolicyValues = {
  baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
  certificateMode: 'per_payee_batch',
  incomeTypeMode: 'all_40_8',
}

/**
 * พฤติกรรมเดิมก่อนมีค่าตั้ง — ใช้ตีความรอบจ่าย/ใบ 50 ทวิ **ที่เกิดก่อน migration** (snapshot เป็น NULL)
 * ทุกชนิดรายการอยู่ในฐาน · ใบต่อรายการ · 40(8) — ข้อมูลเดิมไม่เปลี่ยน
 */
export const LEGACY_WHT_POLICY: WhtPolicyValues = {
  baseExpenseTypes: WHT_POLICY_EXPENSE_TYPES,
  certificateMode: 'per_item',
  incomeTypeMode: 'all_40_8',
}

export const WHT_CERTIFICATE_MODE_LABEL: Record<WhtCertificateMode, string> = {
  per_payee_batch: 'ต่อผู้รับต่อรอบจ่าย (1 ใบรวมทุกรายการของผู้รับในรอบ)',
  per_item: 'ต่อรายการ (1 ใบต่อรายการที่มีการหักภาษี)',
}

export const WHT_INCOME_TYPE_MODE_LABEL: Record<WhtIncomeTypeMode, string> = {
  all_40_8: 'มาตรา 40(8) ทั้งหมด',
  all_40_2: 'มาตรา 40(2) ทั้งหมด',
  by_team_side: 'แยกตามประเภททีม (Inhouse = 40(2) · Outsource = 40(8))',
}

export const WHT_INCOME_CATEGORY_LABEL: Record<WhtIncomeCategory, string> = {
  sec_40_8: 'มาตรา 40(8)',
  sec_40_2: 'มาตรา 40(2)',
}

/** ข้อความประเภทเงินได้บนใบ 50 ทวิ ของ 40(2) — 40(8) ใช้ `income_type` ของ Tax Profile ตามเดิม */
export const INCOME_TYPE_TEXT_40_2 = 'ค่าธรรมเนียม ค่านายหน้า มาตรา 40(2)'

/** อยู่ในฐาน WHT หรือไม่ — `null` (เงินทดรองจ่าย ไม่มีชนิด) ไม่ใช่เงินได้ ⇒ ไม่อยู่ในฐานเสมอ */
export function isInWhtBase(policy: Pick<WhtPolicyValues, 'baseExpenseTypes'>, expenseType: ExpenseType | null): boolean {
  if (expenseType === null) return false
  return policy.baseExpenseTypes.includes(expenseType)
}

/**
 * ประเภทเงินได้ของผู้รับ ณ วันสร้างรอบ (U5) — `side` คือฝั่งของผู้รับที่ resolve แล้ว
 * (`resolvePayoutSide()` อิงทีม/role ของผู้รับ) · ไม่มีฝั่ง ⇒ 40(8) (ค่าเริ่มต้นตามมติ)
 */
export function resolveIncomeCategory(mode: WhtIncomeTypeMode, side: PayoutBatchSide | null): WhtIncomeCategory {
  if (mode === 'all_40_2') return 'sec_40_2'
  if (mode === 'all_40_8') return 'sec_40_8'
  return side === 'inhouse' ? 'sec_40_2' : 'sec_40_8'
}

// ── effective-dated (U8 — แบบ `vat_rate_history`) ──────────────────────────

export interface WhtPolicyEntry extends WhtPolicyValues {
  id: string
  /** คอลัมน์ `DATE` (เที่ยงคืน UTC) */
  effectiveFrom: Date
  createdAt: Date
}

/**
 * ค่าที่มีผล ณ instant หนึ่ง (เทียบเป็น**วันตามปฏิทินไทย**) — `null` = ยังไม่มีแถวที่มีผล ⇒ ผู้เรียกใช้
 * `DEFAULT_WHT_POLICY` · แถวที่ `effective_from` ใหม่สุดที่ ≤ วันนั้นชนะ · วันเดียวกันหลายแถว (แก้ซ้ำในวัน)
 * ⇒ แถวที่บันทึกล่าสุดชนะ (ประวัติไม่ถูกแก้/ลบ — insert-only)
 */
export function resolveWhtPolicyAt<T extends WhtPolicyEntry>(entries: readonly T[], at: Date): T | null {
  const day = toBangkokDayNumber(at)
  let winner: T | null = null
  for (const entry of entries) {
    const from = toDayNumber(entry.effectiveFrom)
    if (from > day) continue
    if (winner === null) {
      winner = entry
      continue
    }
    const winnerFrom = toDayNumber(winner.effectiveFrom)
    if (from > winnerFrom || (from === winnerFrom && entry.createdAt.getTime() > winner.createdAt.getTime())) {
      winner = entry
    }
  }
  return winner
}

/** ค่าที่มีผล — ไม่มีแถวที่มีผลเลย = ค่าเริ่มต้นตามมติ */
export function effectiveWhtPolicy(entries: readonly WhtPolicyEntry[], at: Date): WhtPolicyValues {
  return resolveWhtPolicyAt(entries, at) ?? DEFAULT_WHT_POLICY
}

/** วันที่มีผลย้อนหลังไม่ได้ — ค่าตั้งมีผลกับรอบจ่ายที่สร้าง**หลัง**วันที่มีผลเท่านั้น (วันนี้ได้) */
export function isEffectiveFromAllowed(effectiveFrom: Date, now: Date = new Date()): boolean {
  return toDayNumber(effectiveFrom) >= toBangkokDayNumber(now)
}

/** เรียงชนิดรายการตามลำดับมาตรฐาน + ตัดซ้ำ — ให้ snapshot/audit เทียบกันได้ตรงตัว */
export function normalizeBaseExpenseTypes(types: readonly ExpenseType[]): ExpenseType[] {
  return WHT_POLICY_EXPENSE_TYPES.filter((type) => types.includes(type))
}

/** payload ที่ลง audit (`90` §13 — ภาษี ⇒ reason บังคับ) · snake_case ตามคอลัมน์จริง */
export function toWhtPolicyAuditPayload(values: WhtPolicyValues & { effectiveFrom?: string }): Record<string, unknown> {
  return {
    ...(values.effectiveFrom === undefined ? {} : { effective_from: values.effectiveFrom }),
    base_expense_types: normalizeBaseExpenseTypes(values.baseExpenseTypes),
    certificate_mode: values.certificateMode,
    income_type_mode: values.incomeTypeMode,
  }
}

/**
 * อ่าน snapshot ของรอบจ่าย — คอลัมน์ NULL = รอบที่สร้างก่อนมีค่าตั้ง ⇒ พฤติกรรมเดิม (`LEGACY_WHT_POLICY`)
 * ห้ามเอาค่าตั้งปัจจุบันมาตีความรอบเก่า (Rule 08)
 */
export function payoutBatchWhtPolicy(snapshot: {
  whtBaseExpenseTypes: readonly ExpenseType[] | null
  whtCertificateMode: WhtCertificateMode | null
  whtIncomeTypeMode: WhtIncomeTypeMode | null
}): WhtPolicyValues {
  return {
    baseExpenseTypes: snapshot.whtBaseExpenseTypes ?? LEGACY_WHT_POLICY.baseExpenseTypes,
    certificateMode: snapshot.whtCertificateMode ?? LEGACY_WHT_POLICY.certificateMode,
    incomeTypeMode: snapshot.whtIncomeTypeMode ?? LEGACY_WHT_POLICY.incomeTypeMode,
  }
}
