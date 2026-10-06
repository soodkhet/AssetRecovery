import type { ExpenseType, PayeeType, PayoutBatchSide, WhtCondition } from '@/lib/generated/prisma/enums'
import { toBangkokDayNumber, toDayNumber } from '@/lib/settings/vat'

/**
 * ค่าตั้งภาษีหัก ณ ที่จ่าย 3 ตัว (`22` §6.9 · `13` §6.4.2 · `33` — มติ PO 05/10/2569 UAT U3/U4/U5/U7/U8)
 * **pure ล้วน ใช้ร่วม FE/BE**
 *
 * 1. **ฐาน WHT** (U3) — ชนิดรายการ (`expense_type`) ใดรวมในฐาน · ค่าเริ่มต้น = รายการเหมาจ่าย
 *    (คอมมิชชัน/เบี้ยเสี่ยง/น้ำมัน/เบี้ยเลี้ยง) รวม · ค่าที่พัก/เบิกตามใบเสร็จ/รายการกรอกเอง **ไม่รวม**
 *    (เงินคืนค่าใช้จ่ายที่จ่ายแทนบริษัทตามใบเสร็จไม่ใช่เงินได้ของผู้รับ) — รายการที่ไม่รวมยังจ่ายตามปกติ
 * 2. **การออก 50 ทวิ** (U4) — ต่อผู้รับต่อรอบจ่าย (ค่าเริ่มต้น) / ต่อรายการ (พฤติกรรมเดิม)
 * 3. **ประเภทเงินได้** (U5/U7/U33) — 40(8) ทั้งหมด (ค่าเริ่มต้น) / 40(2) ทั้งหมด / แยกตามประเภททีม
 *    — โหมดแยกตามประเภททีม **เลือกประเภทเงินได้ของ inhouse / outsource เองแยกกัน** จาก 40(1)/40(2)/40(8)
 *    (U33 · ค่าเริ่มต้นของการจับคู่ inhouse = 40(2) · outsource = 40(8) = พฤติกรรมก่อน U33)
 *    · 40(1) และ 40(2) ใช้กติกาเดียวกัน (`usesPerPayeeWhtRate()`): อัตราต่อคนจาก `payee_profiles.wht_40_2_pct`
 *    (ช่องเดียวกัน — ผู้รับหนึ่งคนอยู่ประเภทเดียวต่อรอบ) ไม่มีเกณฑ์ ฿1,000 ไม่คำนวณอัตราก้าวหน้า
 *    (Hybrid Boundary — สำนักงานบัญชีคำนวณให้) · ยื่น ภ.ง.ด.1
 * 4. **40(1)/40(2) อัตรา 0% ออก 50 ทวิ** (U16 · U33 ขยายถึง 40(1)) — เปิด (ค่าเริ่มต้น) = ผู้รับ 40(1)/40(2) ที่อัตรา 0% ได้ใบ 50 ทวิ
 *    ยอดภาษี 0 และนับในสรุป ภ.ง.ด.1 (ผู้รับใช้ยื่น ภ.ง.ด.90/91) · ปิด = ไม่ออก (พฤติกรรมเดิม) ·
 *    40(8) ที่ต่ำกว่าเกณฑ์ ฿1,000 **ไม่เกี่ยว** — ยังไม่ออกใบเหมือนเดิม
 *
 * 5. **อนุญาตเงื่อนไขการหัก (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว** (มติ PO 06/10/2569 U105) — ค่าเริ่มต้น **ปิด**
 *    ปิด = ผู้รับเลือกได้เฉพาะ (1) หัก ณ ที่จ่าย · ผู้รับที่ตั้ง (2)/(3) ไว้แล้ว ⇒ **บล็อกการสร้างรอบจ่าย**
 *    (`WHT_CONDITION_NOT_ALLOWED` — ใบ 50 ทวิ จะพิมพ์เงื่อนไขไม่ตรงกับยอด) · เปิด = คิดภาษีแบบทบยอด (`whtGrossUp()`)
 *
 * **effective-dated แบบ `vat_rate_history`** (U8): ตาราง `wht_policy_history` insert-only ·
 * รอบจ่ายใช้ค่าที่มีผล ณ วันที่สร้างรอบ (วันตามปฏิทินไทย) แล้ว **snapshot ลง `payout_batches`** —
 * เปลี่ยนค่าตั้งภายหลังไม่กระทบรอบเดิม (Rule 08 snapshot pattern)
 */

/** ค่าตรง enum `wht_certificate_mode` / `wht_income_type_mode` / `wht_income_category` ของ `02` §3 */
export const WHT_CERTIFICATE_MODES = ['per_payee_batch', 'per_item'] as const
export const WHT_INCOME_TYPE_MODES = ['all_40_8', 'all_40_2', 'by_team_side'] as const
export const WHT_INCOME_CATEGORIES = ['sec_40_8', 'sec_40_2', 'sec_40_1'] as const
/** ตัวเลือกประเภทเงินได้ต่อประเภททีมในโหมด `by_team_side` (มติ PO 05/10/2569 UAT U33) — เรียงตามมาตรา */
export const WHT_TEAM_SIDE_INCOME_CATEGORIES = ['sec_40_1', 'sec_40_2', 'sec_40_8'] as const

/** ค่าตรง enum `wht_filing_method` (มติ PO 05/10/2569 UAT U45) */
export const WHT_FILING_METHODS = ['online', 'paper'] as const

export type WhtCertificateMode = (typeof WHT_CERTIFICATE_MODES)[number]
export type WhtFilingMethod = (typeof WHT_FILING_METHODS)[number]
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
  /** เงินได้ 40(1)/40(2) อัตรา 0% ⇒ ออก 50 ทวิ ยอดภาษี 0 + รวมใน ภ.ง.ด.1 (U16 · U33) */
  issueZeroRate402Certificate: boolean
  /** โหมด `by_team_side`: ประเภทเงินได้ของผู้รับฝั่ง inhouse (U33) — โหมดอื่นเก็บไว้แต่ไม่ใช้ */
  inhouseIncomeCategory: WhtIncomeCategory
  /** โหมด `by_team_side`: ประเภทเงินได้ของผู้รับฝั่ง outsource (U33) — โหมดอื่นเก็บไว้แต่ไม่ใช้ */
  outsourceIncomeCategory: WhtIncomeCategory
  /** อนุญาตเงื่อนไข (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว (U105) — ปิด = ใช้ได้เฉพาะ (1) */
  allowGrossUpConditions: boolean
}

/**
 * ชุดค่าตั้งเต็มบนหน้าตั้งค่า = ค่าที่รอบจ่าย snapshot (`WhtPolicyValues`) + **วิธียื่น ภ.ง.ด.** (U45)
 * วิธียื่นไม่ snapshot ลงรอบจ่าย — มีผลกับวันกำหนดยื่นของสรุปรอบนำส่ง (`wht_filing_summaries`) เท่านั้น
 */
export interface WhtPolicySettings extends WhtPolicyValues {
  /** ออนไลน์ = กำหนดยื่นวันที่ 15 ของเดือนถัดไป · กระดาษ = วันที่ 7 (ม.59) — ค่าเริ่มต้นออนไลน์ */
  filingMethod: WhtFilingMethod
}

/** ค่าเริ่มต้นตามมติ (ใช้เมื่อองค์กรยังไม่เคยตั้งค่า — ไม่มีแถวใน `wht_policy_history`) */
export const DEFAULT_WHT_POLICY: WhtPolicySettings = {
  baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
  certificateMode: 'per_payee_batch',
  incomeTypeMode: 'all_40_8',
  issueZeroRate402Certificate: true,
  inhouseIncomeCategory: 'sec_40_2',
  outsourceIncomeCategory: 'sec_40_8',
  allowGrossUpConditions: false,
  filingMethod: 'online',
}

/**
 * พฤติกรรมเดิมก่อนมีค่าตั้ง — ใช้ตีความรอบจ่าย/ใบ 50 ทวิ **ที่เกิดก่อน migration** (snapshot เป็น NULL)
 * ทุกชนิดรายการอยู่ในฐาน · ใบต่อรายการ · 40(8) — ข้อมูลเดิมไม่เปลี่ยน
 */
export const LEGACY_WHT_POLICY: WhtPolicyValues = {
  baseExpenseTypes: WHT_POLICY_EXPENSE_TYPES,
  certificateMode: 'per_item',
  incomeTypeMode: 'all_40_8',
  issueZeroRate402Certificate: false,
  // การจับคู่ก่อน U33 (fix ไว้ในโค้ด) — รอบเก่าที่ snapshot การจับคู่เป็น NULL ตีความตามนี้
  inhouseIncomeCategory: 'sec_40_2',
  outsourceIncomeCategory: 'sec_40_8',
  // ก่อน U105 ระบบคิดแบบ (1) เสมอ ⇒ รอบเก่าตีความเป็น "ไม่อนุญาต"
  allowGrossUpConditions: false,
}

export const WHT_CERTIFICATE_MODE_LABEL: Record<WhtCertificateMode, string> = {
  per_payee_batch: 'ต่อผู้รับต่อรอบจ่าย (1 ใบรวมทุกรายการของผู้รับในรอบ)',
  per_item: 'ต่อรายการ (1 ใบต่อรายการที่มีการหักภาษี)',
}

export const WHT_INCOME_TYPE_MODE_LABEL: Record<WhtIncomeTypeMode, string> = {
  all_40_8: 'มาตรา 40(8) ทั้งหมด',
  all_40_2: 'มาตรา 40(2) ทั้งหมด',
  by_team_side: 'แยกตามประเภททีม (เลือกประเภทเงินได้ของ Inhouse / Outsource เอง)',
}

export const WHT_INCOME_CATEGORY_LABEL: Record<WhtIncomeCategory, string> = {
  sec_40_1: 'มาตรา 40(1)',
  sec_40_2: 'มาตรา 40(2)',
  sec_40_8: 'มาตรา 40(8)',
}

/** ป้ายตัวเลือกวิธียื่น ภ.ง.ด. บนหน้าตั้งค่า (U45) */
export const WHT_FILING_METHOD_LABEL: Record<WhtFilingMethod, string> = {
  online: 'ยื่นออนไลน์ (กำหนดยื่นวันที่ 15 ของเดือนถัดไป)',
  paper: 'ยื่นแบบกระดาษ (กำหนดยื่นวันที่ 7 ของเดือนถัดไป)',
}

/** ป้ายต่อท้ายวันกำหนดยื่น (U45) — "15/11/2569 (ยื่นออนไลน์)" */
export const WHT_FILING_METHOD_SUFFIX: Record<WhtFilingMethod, string> = {
  online: '(ยื่นออนไลน์)',
  paper: '(ยื่นแบบกระดาษ)',
}

/** ป้ายของค่าตั้ง U16 บนหน้าตั้งค่า/รายละเอียดรอบจ่าย */
export const ISSUE_ZERO_RATE_40_2_LABEL = 'เงินได้ 40(1)/40(2) อัตรา 0%: ออก 50 ทวิ (ยอดภาษี 0) และรวมใน ภ.ง.ด.1'

/** ป้ายของค่าตั้ง U105 บนหน้าตั้งค่า/รายละเอียดรอบจ่าย */
export const ALLOW_GROSS_UP_CONDITIONS_LABEL = 'อนุญาตเงื่อนไข (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว (บริษัทออกภาษีให้ผู้รับ)'

/**
 * เงื่อนไขการหักนี้ใช้ได้ภายใต้ค่าตั้งหรือไม่ (U105) — (1) ใช้ได้เสมอ · (2)/(3) ต้องเปิดค่าตั้ง
 * ใช้ทั้งฟอร์มผู้รับ (ตัวเลือกที่เลือกได้) และ server (บันทึกผู้รับ/สร้างรอบจ่าย)
 */
export function isWhtConditionAllowed(
  policy: Pick<WhtPolicyValues, 'allowGrossUpConditions'>,
  condition: WhtCondition,
): boolean {
  return condition === 'withhold' || policy.allowGrossUpConditions
}

/** ข้อความประเภทเงินได้บนใบ 50 ทวิ ของ 40(2) — 40(8) ใช้ `income_type` ของ Tax Profile ตามเดิม */
export const INCOME_TYPE_TEXT_40_2 = 'ค่าธรรมเนียม ค่านายหน้า มาตรา 40(2)'
/** ข้อความประเภทเงินได้บนใบ 50 ทวิ ของ 40(1) (มติ PO 05/10/2569 UAT U33) — แถวที่ 1 ของแบบ 50 ทวิ */
export const INCOME_TYPE_TEXT_40_1 = 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ มาตรา 40(1)'
/**
 * ข้อความประเภทเงินได้ของผู้รับ**นิติบุคคล** (มติ PO 06/10/2569 UAT U96 #2) — ค่าบริการ/ค่าจ้างทำของที่หัก ณ ที่จ่าย
 * ตามคำสั่งกรมสรรพากรที่ออกตาม ม.3 เตรส (ยื่น ภ.ง.ด.53 ตาม ม.69 ทวิ) — แถวที่ 5 ของแบบ 50 ทวิ ไม่ใช่ "มาตรา 40(8)"
 */
export const INCOME_TYPE_TEXT_CORPORATE = 'ค่าบริการ / ค่าจ้างทำของ (หัก ณ ที่จ่ายตามมาตรา 3 เตรส)'

/**
 * ประเภทเงินได้ที่ใช้ **อัตราต่อคน** (`payee_profiles.wht_40_2_pct`) · ไม่มีเกณฑ์ขั้นต่ำ · ยื่น **ภ.ง.ด.1**
 * = 40(1) และ 40(2) (มติ PO 05/10/2569 UAT U7 · U33 "40(1) ใช้กติกาเดียวกับ 40(2)") · 40(8) ใช้ Tax Profile
 */
export function usesPerPayeeWhtRate(category: WhtIncomeCategory | null | undefined): boolean {
  return category === 'sec_40_1' || category === 'sec_40_2'
}

/** อยู่ในฐาน WHT หรือไม่ — `null` (เงินทดรองจ่าย ไม่มีชนิด) ไม่ใช่เงินได้ ⇒ ไม่อยู่ในฐานเสมอ */
export function isInWhtBase(policy: Pick<WhtPolicyValues, 'baseExpenseTypes'>, expenseType: ExpenseType | null): boolean {
  if (expenseType === null) return false
  return policy.baseExpenseTypes.includes(expenseType)
}

/**
 * ประเภทเงินได้ของผู้รับ ณ วันสร้างรอบ (U5 · U33) — `side` คือฝั่งของผู้รับที่ resolve แล้ว
 * (`resolvePayoutSide()` อิงทีม/role ของผู้รับ) · โหมด `by_team_side` ใช้การจับคู่ที่ตั้งไว้ต่อประเภททีม
 * · ไม่มีฝั่ง ⇒ 40(8) (ค่าเริ่มต้นตามมติ)
 */
export function resolveIncomeCategory(
  policy: Pick<WhtPolicyValues, 'incomeTypeMode' | 'inhouseIncomeCategory' | 'outsourceIncomeCategory'>,
  side: PayoutBatchSide | null,
  /**
   * ชนิดผู้รับ (มติ PO 06/10/2569 UAT U96 #2) — **นิติบุคคลไม่มีเงินได้ 40(1)/40(2)** (มาตรา 40 เป็นเงินได้ของ
   * บุคคลธรรมดา) ⇒ ทุกโหมดคืนหมวดที่ใช้ Tax Profile (`sec_40_8` = ค่าบริการ/ค่าจ้างทำของ หัก ณ ที่จ่ายตาม
   * ม.3 เตรส · ม.69 ทวิ) และยื่น ภ.ง.ด.53 (`filingFormOf()`) · ไม่ใช้อัตราต่อคน · ไม่ระบุ = บุคคลธรรมดา (เดิม)
   */
  payeeType: PayeeType = 'individual',
): WhtIncomeCategory {
  if (payeeType === 'corporate') return 'sec_40_8'
  if (policy.incomeTypeMode === 'all_40_2') return 'sec_40_2'
  if (policy.incomeTypeMode === 'all_40_8') return 'sec_40_8'
  if (side === 'inhouse') return policy.inhouseIncomeCategory
  if (side === 'outsource') return policy.outsourceIncomeCategory
  return 'sec_40_8'
}

// ── effective-dated (U8 — แบบ `vat_rate_history`) ──────────────────────────

export interface WhtPolicyEntry extends WhtPolicySettings {
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
export function effectiveWhtPolicy(entries: readonly WhtPolicyEntry[], at: Date): WhtPolicySettings {
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

/**
 * BUG-157 — ค่าที่ฟอร์มส่งจริง: การจับคู่ประเภทเงินได้ inhouse/outsource **มีผลเฉพาะโหมดแยกตามประเภททีม**
 * โหมดอื่นช่องนี้ถูกซ่อน ⇒ ส่งค่าเดิมของชุดปัจจุบันไปแทนค่าที่ผู้ใช้อาจแก้ค้างไว้ก่อนเปลี่ยนโหมด
 * (กันการจับคู่เดิมหายแล้วต้องบันทึกชุดใหม่ซ้ำเพื่อคืนค่า — ประวัติเกินจำเป็น)
 */
export function effectiveTeamSideCategories<
  T extends Pick<WhtPolicyValues, 'incomeTypeMode' | 'inhouseIncomeCategory' | 'outsourceIncomeCategory'>,
>(form: T, current: Pick<WhtPolicyValues, 'inhouseIncomeCategory' | 'outsourceIncomeCategory'>): T {
  if (form.incomeTypeMode === 'by_team_side') return form
  return {
    ...form,
    inhouseIncomeCategory: current.inhouseIncomeCategory,
    outsourceIncomeCategory: current.outsourceIncomeCategory,
  }
}

/** payload ที่ลง audit (`90` §13 — ภาษี ⇒ reason บังคับ) · snake_case ตามคอลัมน์จริง */
export function toWhtPolicyAuditPayload(
  values: WhtPolicyValues & { effectiveFrom?: string; filingMethod?: WhtFilingMethod },
): Record<string, unknown> {
  return {
    ...(values.effectiveFrom === undefined ? {} : { effective_from: values.effectiveFrom }),
    base_expense_types: normalizeBaseExpenseTypes(values.baseExpenseTypes),
    certificate_mode: values.certificateMode,
    income_type_mode: values.incomeTypeMode,
    issue_zero_rate_40_2_certificate: values.issueZeroRate402Certificate,
    inhouse_income_category: values.inhouseIncomeCategory,
    outsource_income_category: values.outsourceIncomeCategory,
    allow_gross_up_conditions: values.allowGrossUpConditions,
    ...(values.filingMethod === undefined ? {} : { filing_method: values.filingMethod }),
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
  /** NULL = รอบที่สร้างก่อนมีค่าตั้ง U16 ⇒ ไม่ออกใบ 0% (พฤติกรรมเดิม) */
  whtIssueZeroRate402Certificate: boolean | null
  /** NULL = รอบที่สร้างก่อนมีค่าตั้ง U33 ⇒ การจับคู่เดิม inhouse 40(2) · outsource 40(8) */
  whtInhouseIncomeCategory: WhtIncomeCategory | null
  whtOutsourceIncomeCategory: WhtIncomeCategory | null
  /** NULL = รอบที่สร้างก่อนมีค่าตั้ง U105 ⇒ ไม่อนุญาต (คิดแบบ (1) เสมอ) */
  whtAllowGrossUpConditions?: boolean | null
}): WhtPolicyValues {
  return {
    baseExpenseTypes: snapshot.whtBaseExpenseTypes ?? LEGACY_WHT_POLICY.baseExpenseTypes,
    certificateMode: snapshot.whtCertificateMode ?? LEGACY_WHT_POLICY.certificateMode,
    incomeTypeMode: snapshot.whtIncomeTypeMode ?? LEGACY_WHT_POLICY.incomeTypeMode,
    issueZeroRate402Certificate:
      snapshot.whtIssueZeroRate402Certificate ?? LEGACY_WHT_POLICY.issueZeroRate402Certificate,
    inhouseIncomeCategory: snapshot.whtInhouseIncomeCategory ?? LEGACY_WHT_POLICY.inhouseIncomeCategory,
    outsourceIncomeCategory: snapshot.whtOutsourceIncomeCategory ?? LEGACY_WHT_POLICY.outsourceIncomeCategory,
    allowGrossUpConditions: snapshot.whtAllowGrossUpConditions ?? LEGACY_WHT_POLICY.allowGrossUpConditions,
  }
}
