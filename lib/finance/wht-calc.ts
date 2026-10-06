import { assertNonNegativeSatang, assertPct, pctOfSatang } from '@/lib/finance/satang'
import type { WhtCondition } from '@/lib/generated/prisma/enums'
import {
  DEFAULT_WHT_MIN_THRESHOLD_SATANG,
  assertWhtPctValid,
  type WhtBasis,
} from '@/lib/settings/tax-profile'
import { usesPerPayeeWhtRate, type WhtIncomeCategory } from '@/lib/settings/wht-policy'

/**
 * ภาษีหัก ณ ที่จ่าย (`22` §6.9 · `18` §6.3 · `13` §6.4) — **pure ล้วน ไม่มี I/O**
 *
 * ### กติกาเหล็ก 3 ข้อ (Rule 01)
 * 1. **Payee level ชนะ Plan level เสมอ** — `payee.tax_profile.wht_pct` มาก่อน `plan.wht_pct` ทุกกรณี
 *    · fallback ไป Plan ได้เฉพาะเมื่อ Payee **ยังไม่มี Tax Profile** และต้อง **มี warning** ติดกลับไป
 *    เสมอ (`18` §6.3 — ให้เจ้าหน้าที่รีบผูก Tax Profile)
 * 2. **ฐานหักเป็น `before_vat`** (มาตรฐาน) — `gross_amount` รองรับได้แต่ไม่ปกติ
 * 3. **ต่ำกว่าเกณฑ์ขั้นต่ำไม่หัก** (ค่าเริ่มต้น 1,000 บาท = 100,000 สตางค์) — เกณฑ์เป็น**ค่าตั้งได้**
 *    ห้าม hardcode ในสูตร
 */

/**
 * อัตรามาจากไหน (`18` §6.3 · มติ PO 06/10/2569 U121)
 * - `payee` = Tax Profile ที่ผูกรายคน (หรืออัตรา 40(1)/40(2) ต่อคน)
 * - `type_default` = Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (ฝั่ง × ชนิดผู้รับ) — **นับเป็นฝั่ง payee** (ไม่เตือน)
 * - `plan` = fallback อัตราของแผน (ต้องแสดง `warning`)
 * - `none` = ไม่ได้ใช้อัตรา: รายการไม่อยู่ในฐาน WHT (ไม่ resolve) หรือไม่มีอัตราเลย (`rateMissing`)
 */
export type WhtRateOrigin = 'payee' | 'type_default' | 'plan' | 'none'

/** ค่าที่ resolve ได้จริงว่าจะใช้อัตราไหน (`18` §6.3) */
export interface WhtRateResolution {
  whtPct: number
  whtBasis: WhtBasis
  minThresholdSatang: number
  source: WhtRateOrigin
  /** ข้อความเตือนสำหรับ `warning` ใน envelope — มีเฉพาะกรณี fallback (`18` §6.3) */
  warning?: string
}

/** ค่าจาก Tax Profile ของ Payee — `null` ทั้งก้อน = payee ยังไม่ผูก Tax Profile */
export interface PayeeTaxProfileValues {
  whtPct: number
  whtBasis: WhtBasis
  whtMinThresholdSatang: number
}

export interface WhtRateSource {
  /** `payee_profiles.tax_profile_id → tax_profiles` — `null` = ยังไม่ผูก */
  payeeTaxProfile: PayeeTaxProfileValues | null
  /**
   * Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO U121 — `tax_profile_default_history` ช่องที่ตรงฝั่ง × ชนิดผู้รับ)
   * · ไม่ระบุ/`null` = ไม่มีค่าเริ่มต้นสำหรับประเภทนี้
   */
  typeDefaultTaxProfile?: PayeeTaxProfileValues | null
  /** `compensation_plans.wht_pct` ที่ snapshot ไว้กับรายการเบิก — ใช้เป็น fallback เท่านั้น · `null` = รายการไม่มีแผน */
  planWhtPct: number | null
}

export const WHT_PLAN_FALLBACK_WARNING =
  'ผู้รับเงินยังไม่มีกติกาภาษี (Tax Profile) ทั้งแบบรายคนและค่าเริ่มต้นตามประเภทผู้รับ — ใช้อัตราจากแผนค่าตอบแทนชั่วคราว โปรดผูก Tax Profile โดยเร็ว'

function fromProfile(profile: PayeeTaxProfileValues, source: 'payee' | 'type_default'): WhtRateResolution {
  assertWhtPctValid(profile.whtPct)
  assertNonNegativeSatang(profile.whtMinThresholdSatang, 'เกณฑ์ขั้นต่ำ WHT')
  return {
    whtPct: profile.whtPct,
    whtBasis: profile.whtBasis,
    minThresholdSatang: profile.whtMinThresholdSatang,
    source,
  }
}

/**
 * ลำดับ resolve อัตรา 40(8)/นิติบุคคล (`18` §6.3 · มติ PO 06/10/2569 U121):
 * 1. Tax Profile ที่ผูกรายคน (override)
 * 2. Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (นับเป็นฝั่ง payee — "Payee ชนะ Plan" คงเดิม)
 * 3. อัตราของแผน + warning (fallback ชั่วคราว)
 * 4. ไม่มีเลย ⇒ **`null`** (ไม่ throw · ไม่เดาอัตรา) — ผู้เรียกแสดงคำเตือน/บล็อกการสร้างรอบจ่ายเอง
 *
 * fallback แผนใช้ `wht_basis`/threshold **มาตรฐาน** (`before_vat` / 1,000 บาท) เพราะ Plan level เก็บแค่
 * อัตรา (`02` §5 — `compensation_plans.wht_pct` ตัวเดียว) ไม่มีฐานหักและเกณฑ์ขั้นต่ำของตัวเอง
 */
export function resolveWhtRate(source: WhtRateSource): WhtRateResolution | null {
  if (source.payeeTaxProfile !== null) return fromProfile(source.payeeTaxProfile, 'payee')
  if (source.typeDefaultTaxProfile !== undefined && source.typeDefaultTaxProfile !== null) {
    return fromProfile(source.typeDefaultTaxProfile, 'type_default')
  }
  // รายการไม่มีแผน (เบิกเอง/ค่าที่พัก) + ไม่มี Tax Profile ใด ๆ ⇒ ไม่มีอัตรา (มติ PO U121 — ห้าม 500)
  if (source.planWhtPct === null) return null
  assertWhtPctValid(source.planWhtPct)

  return {
    whtPct: source.planWhtPct,
    whtBasis: 'before_vat',
    minThresholdSatang: DEFAULT_WHT_MIN_THRESHOLD_SATANG,
    source: 'plan',
    warning: WHT_PLAN_FALLBACK_WARNING,
  }
}

/** อัตราว่างของรายการที่ไม่ได้ใช้อัตรา (ไม่อยู่ในฐาน/ไม่มีอัตรา) — ภาษี 0 เสมอ */
const NO_RATE: WhtRateResolution = { whtPct: 0, whtBasis: 'before_vat', minThresholdSatang: 0, source: 'none' }

export interface WhtCalculationInput {
  /** ยอดก่อนหักภาษี ของรายการที่จะจ่าย (`payout_batch_items.gross_satang`) */
  grossSatang: number
  /** VAT ของรายการนั้น — ใช้เฉพาะเมื่อ `wht_basis = gross_amount` (ปกติฝั่งจ่ายไม่มี ⇒ 0) */
  vatSatang?: number
  whtPct: number
  whtBasis: WhtBasis
  minThresholdSatang: number
}

export interface WhtCalculation {
  /** ฐานหักที่ใช้จริง (`before_vat` = gross · `gross_amount` = gross + vat) */
  baseSatang: number
  whtSatang: number
  /** `gross - wht` = ยอดโอนจริง (**ไม่** ลบ VAT — VAT ฝั่งจ่ายไม่ใช่ของเรา) */
  netSatang: number
  /** true = ฐานหักต่ำกว่าเกณฑ์ขั้นต่ำ ⇒ ไม่หักภาษี (`22` §6.9) */
  belowThreshold: boolean
  whtPctUsed: number
  whtBasisUsed: WhtBasis
}

/** `22` §6.9 — ฐานหัก → เทียบเกณฑ์ขั้นต่ำ → คิดภาษี → `net = gross - wht` */
export function calculateWht(input: WhtCalculationInput): WhtCalculation {
  assertNonNegativeSatang(input.grossSatang, 'ยอดก่อนหักภาษี')
  assertNonNegativeSatang(input.vatSatang ?? 0, 'VAT ของรายการ')
  assertNonNegativeSatang(input.minThresholdSatang, 'เกณฑ์ขั้นต่ำ WHT')
  assertPct(input.whtPct, 'อัตรา WHT')

  const baseSatang = input.whtBasis === 'gross_amount' ? input.grossSatang + (input.vatSatang ?? 0) : input.grossSatang
  const belowThreshold = baseSatang < input.minThresholdSatang
  const whtSatang = belowThreshold ? 0 : pctOfSatang(baseSatang, input.whtPct)

  return {
    baseSatang,
    whtSatang,
    netSatang: input.grossSatang - whtSatang,
    belowThreshold,
    whtPctUsed: input.whtPct,
    whtBasisUsed: input.whtBasis,
  }
}

export interface PayeeWhtResult extends WhtCalculation {
  /** อัตราที่ใช้มาจากไหน + warning ของ fallback (`18` §6.3) */
  rate: WhtRateResolution
}

/**
 * ทางลัด resolve อัตราตามลำดับ (`resolveWhtRate()`) แล้วคิดยอดในก้าวเดียว — ใช้กับตัวอย่างคำอธิบายค่าตั้ง
 * · ไม่มีอัตราเลย ⇒ `null` (ไม่ throw — มติ PO U121)
 */
export function calculateWhtForPayee(input: {
  grossSatang: number
  vatSatang?: number
  source: WhtRateSource
}): PayeeWhtResult | null {
  const rate = resolveWhtRate(input.source)
  if (rate === null) return null
  const calculation = calculateWht({
    grossSatang: input.grossSatang,
    vatSatang: input.vatSatang,
    whtPct: rate.whtPct,
    whtBasis: rate.whtBasis,
    minThresholdSatang: rate.minThresholdSatang,
  })
  return { ...calculation, rate }
}

// ── เงื่อนไขการหัก (1)/(2)/(3) — มติ PO 06/10/2569 U105 ─────────────────────────

/**
 * เงื่อนไขที่ **ผู้จ่ายออกภาษีให้** — (2) ออกให้ตลอดไป / (3) ออกให้ครั้งเดียว · (1) หัก ณ ที่จ่าย = ผู้รับรับภาระเอง
 * ค่า `null`/ไม่ระบุ (รายการรอบเก่า/เงินทดรองจ่าย) ถือเป็น (1)
 */
export function isPayerBorneWhtCondition(condition: WhtCondition | null | undefined): boolean {
  return condition === 'pay_always' || condition === 'pay_once'
}

/**
 * **ภาษีของฐานหนึ่งก้อนตามเงื่อนไขการหัก** (`22` §6.9.2 — มติ PO U105) · ปัดครึ่งขึ้นเป็นสตางค์ครั้งเดียว
 *
 * - (1) หัก ณ ที่จ่าย / (3) ออกให้ครั้งเดียว: `ภาษี = ฐาน × อัตรา` (`pctOfSatang()` ตัวเดียวกับสูตรเดิม)
 * - (2) ออกให้ตลอดไป (ทบยอด): `ภาษี = ฐาน × อัตรา ÷ (1 − อัตรา)` — คิดเป็นจำนวนเต็มด้วย BigInt
 *   (อัตรา `NUMERIC(5,2)` ⇒ แปลงเป็น basis point ×100 แล้วปัดครั้งเดียวที่ผลลัพธ์ — ไม่มีเศษ float สะสม)
 *   อัตรา 100% ทบยอดไม่ได้ (ตัวหารเป็นศูนย์) ⇒ RangeError
 */
export function whtTaxForCondition(baseSatang: number, whtPct: number, condition: WhtCondition | null | undefined): number {
  assertNonNegativeSatang(baseSatang, 'ฐานภาษี')
  assertPct(whtPct, 'อัตรา WHT')
  if (condition !== 'pay_always') return pctOfSatang(baseSatang, whtPct)
  const basisPoints = BigInt(Math.round(whtPct * 100))
  const denominator = 10_000n - basisPoints
  if (denominator <= 0n) throw new RangeError('whtTaxForCondition: อัตรา 100% คิดภาษีแบบออกให้ตลอดไปไม่ได้')
  // round-half-up ของ base × bp / (10000 − bp) = floor((2 × base × bp + denom) / (2 × denom))
  const numerator = 2n * BigInt(baseSatang) * basisPoints + denominator
  return Number(numerator / (2n * denominator))
}

export interface WhtGrossUp {
  /** ภาษีที่ต้องนำส่ง (ผู้รับรับภาระ = หักจากผู้รับ · ผู้จ่ายออกให้ = ค่าใช้จ่ายบริษัท) */
  whtSatang: number
  /** เงินได้ที่แสดงบนใบ 50 ทวิ / ภ.ง.ด. — (1) = เงินได้ · (2)/(3) = เงินได้ + ภาษีที่ออกให้ */
  certificateIncomeSatang: number
  /** ยอดที่ผู้รับได้ (ก่อนหักคืนเงินทดรอง) — (1) = เงินได้ − ภาษี · (2)/(3) = เงินได้เต็ม */
  payeeReceivesSatang: number
  /** ต้นทุนรวมของบริษัท = ยอดที่ผู้รับได้ + ภาษีที่นำส่ง */
  companyCostSatang: number
  /** ภาษีที่บริษัทออกให้ (แยกบรรทัดในใบสำคัญจ่าย/สลิป) — (1) = 0 */
  whtPaidByPayerSatang: number
}

/**
 * **`whtGrossUp()` — ยอดทั้งชุดของเงินได้ก้อนเดียว** ตามเงื่อนไขการหัก (`22` §6.9.2 · มติ PO U105)
 * ตัวอย่างที่ต้องตรงเสมอ — เงินได้ ฿10,000 อัตรา 3%:
 * (1) ภาษี 300.00 ผู้รับได้ 9,700.00 · (2) ภาษี 309.28 เงินได้บนใบ 10,309.28 · (3) ภาษี 300.00 เงินได้บนใบ 10,300.00
 * เกณฑ์ขั้นต่ำ (฿1,000) เทียบกับ **เงินได้ก่อนบวกภาษี** — ผู้เรียกตัดสินก่อน (ต่ำกว่าเกณฑ์ = ไม่เรียก/ภาษี 0)
 */
export function whtGrossUp(input: {
  incomeSatang: number
  whtPct: number
  condition: WhtCondition | null | undefined
}): WhtGrossUp {
  const whtSatang = whtTaxForCondition(input.incomeSatang, input.whtPct, input.condition)
  return splitByCondition(input.incomeSatang, whtSatang, input.condition)
}

/** แยกยอดของเงินได้ + ภาษีที่คิดแล้ว ตามเงื่อนไข (ไม่คิดภาษีใหม่) */
function splitByCondition(incomeSatang: number, whtSatang: number, condition: WhtCondition | null | undefined): WhtGrossUp {
  if (isPayerBorneWhtCondition(condition)) {
    return {
      whtSatang,
      certificateIncomeSatang: incomeSatang + whtSatang,
      payeeReceivesSatang: incomeSatang,
      companyCostSatang: incomeSatang + whtSatang,
      whtPaidByPayerSatang: whtSatang,
    }
  }
  return {
    whtSatang,
    certificateIncomeSatang: incomeSatang,
    payeeReceivesSatang: incomeSatang - whtSatang,
    companyCostSatang: incomeSatang,
    whtPaidByPayerSatang: 0,
  }
}

/**
 * ยอดแยกของ**รายการรอบจ่ายที่ snapshot แล้ว** สำหรับเอกสาร (ใบสำคัญจ่าย/สลิป/ไฟล์ส่งบัญชี) — ไม่คิดภาษีใหม่
 *
 * รายการของผู้รับที่ผู้จ่ายออกภาษีให้เก็บแบบ `gross = เงินได้ + ภาษี` · `net = เงินได้` (ทำให้ `net = gross − wht`
 * ยังจริงทุกแถว และเงินได้บนใบ 50 ทวิ = ผลรวม gross ตรงตัว) ⇒ ค่าตอบแทนที่ผู้รับได้ = `net` · ภาษีที่ออกให้ = `wht`
 */
export function payoutItemTaxSplit(item: {
  grossSatang: number
  whtSatang: number
  netSatang: number
  whtCondition: WhtCondition | null | undefined
}): { compensationSatang: number; whtWithheldSatang: number; whtPaidByPayerSatang: number } {
  if (isPayerBorneWhtCondition(item.whtCondition)) {
    return { compensationSatang: item.netSatang, whtWithheldSatang: 0, whtPaidByPayerSatang: item.whtSatang }
  }
  return { compensationSatang: item.grossSatang, whtWithheldSatang: item.whtSatang, whtPaidByPayerSatang: 0 }
}

/** ยอดแยกของรายการรอบจ่าย 3 ส่วน (`payoutItemTaxSplit()`) */
export interface PayoutTaxSplit {
  /** ค่าตอบแทน (เงินได้จริง — ไม่รวมภาษีที่บริษัทออกให้) */
  compensationSatang: number
  /** ภาษีที่หักจากผู้รับ (เงื่อนไข (1)) */
  whtWithheldSatang: number
  /** ภาษีที่บริษัทออกให้ (เงื่อนไข (2)/(3) — ไม่หักจากผู้รับ) */
  whtPaidByPayerSatang: number
}

/**
 * ผลรวมยอดแยกของหลายรายการ (มติ PO U109 — สรุปรอบจ่าย/รายการรอบจ่าย/รายงานค่าตอบแทน แยกแสดง
 * "ค่าตอบแทน" กับ "ภาษีที่บริษัทออกให้") · ไม่คิดภาษีใหม่ — บวกจาก snapshot ผ่าน `payoutItemTaxSplit()` เท่านั้น
 * ⇒ `compensation + whtPaidByPayer = Σ gross` และ `Σ gross − whtWithheld − whtPaidByPayer = Σ net` เสมอ
 */
export function sumPayoutTaxSplit(
  items: ReadonlyArray<Parameters<typeof payoutItemTaxSplit>[0]>,
): PayoutTaxSplit {
  return items.reduce<PayoutTaxSplit>(
    (sum, item) => {
      const split = payoutItemTaxSplit(item)
      return {
        compensationSatang: sum.compensationSatang + split.compensationSatang,
        whtWithheldSatang: sum.whtWithheldSatang + split.whtWithheldSatang,
        whtPaidByPayerSatang: sum.whtPaidByPayerSatang + split.whtPaidByPayerSatang,
      }
    },
    { compensationSatang: 0, whtWithheldSatang: 0, whtPaidByPayerSatang: 0 },
  )
}

export interface PayeeBatchWhtItem {
  /** ยอดก่อนหักภาษีของรายการ (`payout_batch_items.gross_satang`) */
  grossSatang: number
  vatSatang?: number
  /** แหล่งอัตรา — Tax Profile ของ payee (เหมือนกันทุกรายการของ payee) + อัตราแผนที่ snapshot ไว้กับรายการ */
  source: WhtRateSource
  /**
   * รายการนี้อยู่ในฐาน WHT หรือไม่ (ค่าตั้งฐาน WHT — มติ PO 05/10/2569 U3 · `isInWhtBase()`)
   * `false` = จ่ายเต็มตามปกติแต่ไม่นับเข้าฐาน/เกณฑ์ และไม่ถูกหัก · ไม่ระบุ = `true` (พฤติกรรมเดิม)
   */
  includedInBase?: boolean
}

/** ตัวเลือกระดับผู้รับ (มติ PO 05/10/2569 U5/U7) — ไม่ระบุ = 40(8) ตามพฤติกรรมเดิม */
export interface PayeeBatchWhtOptions {
  /** ประเภทเงินได้ของผู้รับในรอบนี้ (`resolveIncomeCategory()`) */
  incomeCategory?: WhtIncomeCategory
  /**
   * อัตราหัก 40(1)/40(2) ต่อคน (`payee_profiles.wht_40_2_pct` — สำนักงานบัญชีคำนวณให้ · 0.00 ได้)
   * ใช้เมื่อ `incomeCategory = sec_40_1 | sec_40_2` เท่านั้น (`usesPerPayeeWhtRate()` — มติ PO U33)
   * · `null` ⇒ คิดไม่ได้ (ผู้เรียกต้องปัดการสร้างรอบก่อน)
   */
  section402Pct?: number | null
  /**
   * เงื่อนไขการหักของผู้รับ (มติ PO U105 · snapshot ลงรายการรอบจ่าย) — ไม่ระบุ = (1) หัก ณ ที่จ่าย
   * (2)/(3) ⇒ ภาษีตาม `whtTaxForCondition()` · ผู้รับได้เงินเต็ม · `payoutGrossSatang = gross + ภาษี` (เงินได้บนใบ)
   * ผู้เรียกต้องตรวจว่าค่าตั้งอนุญาตเงื่อนไขนี้ก่อน (`isWhtConditionAllowed()`)
   */
  condition?: WhtCondition | null
}

export interface PayeeBatchWhtLine extends PayeeWhtResult {
  /** อยู่ในฐาน WHT หรือไม่ — `false` ⇒ `baseSatang = 0` และ `whtSatang = 0` */
  includedInBase: boolean
  incomeCategory: WhtIncomeCategory
  /**
   * ยอดที่บันทึกเป็น `payout_batch_items.gross_satang` — (1) = ยอดของรายการ · (2)/(3) = ยอดของรายการ + ภาษีที่ออกให้
   * (= เงินได้บนใบ 50 ทวิ) · `netSatang` = `payoutGrossSatang − whtSatang` เสมอ
   */
  payoutGrossSatang: number
  /** เงื่อนไขการหักที่ใช้ (snapshot) — `withhold` เมื่อไม่ระบุ */
  whtCondition: WhtCondition
  /**
   * รายการอยู่ในฐาน WHT แต่**ไม่มีอัตราเลย** (ไม่มี Tax Profile รายคน/ค่าเริ่มต้นตามประเภท และไม่มีอัตราแผน
   * — มติ PO U121) ⇒ ภาษี 0 ไม่นับเข้าฐาน/เกณฑ์ · คิวอนุมัติแสดงคำเตือน · รอบจ่ายต้องบล็อก (`WHT_RATE_MISSING`)
   */
  rateMissing: boolean
}

export interface PayeeBatchWht {
  /** ผลต่อรายการ **ลำดับเดียวกับ input** — `net = gross − wht` ทุกแถว */
  lines: PayeeBatchWhtLine[]
  /** ฐานหักรวมของ payee ในรอบจ่าย (เฉพาะรายการที่อยู่ในฐาน) — ตัวที่ใช้เทียบเกณฑ์ขั้นต่ำ */
  totalBaseSatang: number
  /** ภาษีรวมของ payee ในรอบ = ผลรวม `lines[].whtSatang` เป๊ะ (ไม่มีเศษสตางค์หาย) */
  totalWhtSatang: number
  /** true = ฐานรวมของ payee ต่ำกว่าเกณฑ์ ⇒ ไม่หักทุกรายการ (40(1)/40(2) ไม่มีเกณฑ์ ⇒ false เมื่อมีรายการในฐาน) */
  belowThreshold: boolean
  incomeCategory: WhtIncomeCategory
  /** มีรายการในฐานที่ไม่มีอัตรา (`lines[].rateMissing`) — ผู้สร้างรอบจ่ายต้องปัดทั้งรอบ (มติ PO U121) */
  rateMissing: boolean
}

/** 40(1)/40(2) ไม่มีเกณฑ์ขั้นต่ำ ฿1,000 และฐานเป็นยอดก่อน VAT เสมอ (มติ PO 05/10/2569 U7 · U33) */
function section402Rate(pct: number | null | undefined): WhtRateResolution {
  if (pct === null || pct === undefined) {
    throw new RangeError('calculatePayeeBatchWht: ผู้รับเงินประเภท 40(1)/40(2) ยังไม่มีอัตราหัก — ต้องปัดการสร้างรอบก่อนถึงสูตร')
  }
  assertWhtPctValid(pct)
  return { whtPct: pct, whtBasis: 'before_vat', minThresholdSatang: 0, source: 'payee' }
}

/**
 * **WHT ต่อ payee ต่อรอบจ่าย** (`22` §6.9 — มติ PO 03/10/2569 UAT Q5, BUG-014)
 *
 * เกณฑ์ขั้นต่ำ (ค่าเริ่มต้น ฿1,000) เทียบกับ **ฐานรวมของ payee ทั้งรอบจ่าย** ไม่ใช่ต่อรายการ แล้วกระจาย
 * ภาษีรวมกลับลงรายการ:
 * 1. resolve อัตราต่อรายการด้วย `resolveWhtRate()` (รายคน → ค่าเริ่มต้นตามประเภท → Plan — `18` §6.3 · U121)
 *    **เฉพาะรายการในฐาน** · ไม่มีอัตราเลย ⇒ `rateMissing` (ภาษี 0 ไม่นับฐาน) แทนการ throw
 * 2. ฐานรวม < เกณฑ์ ⇒ ทุกรายการ wht = 0
 * 3. ไม่งั้นจัดกลุ่มตามอัตรา → ภาษีของกลุ่ม = `pctOfSatang(ฐานรวมของกลุ่ม, อัตรา)` (ปัดครั้งเดียวต่อกลุ่ม)
 * 4. กระจายภาษีของกลุ่มลงรายการตามสัดส่วนฐาน ด้วย **largest remainder** (ปัดลงก่อน แล้วแจกเศษทีละ
 *    1 สตางค์ให้รายการที่เศษมากสุด · เสมอกันให้รายการที่มาก่อน) ⇒ ผลรวมรายการ = ภาษีของกลุ่มเป๊ะ
 *
 * ทุกรายการต้องเป็นของ payee เดียวกัน (ผู้เรียกจัดกลุ่มเอง) — เกณฑ์ขั้นต่ำต่างกันในชุดเดียว = ข้อมูลพัง
 *
 * **ค่าตั้งภาษี (มติ PO 05/10/2569 U3/U5/U7)**
 * - รายการที่ `includedInBase = false` (เช่นค่าที่พัก/เบิกตามใบเสร็จ) ไม่นับเข้าฐานรวม/เกณฑ์ และไม่ถูกหัก
 *   — ยังจ่ายเต็มยอด (`net = gross`)
 * - `incomeCategory = sec_40_1 | sec_40_2` ⇒ อัตรา = `section402Pct` ของผู้รับ (ไม่ใช่ Tax Profile/Plan)
 *   **ไม่มีเกณฑ์ขั้นต่ำ** · ไม่คำนวณอัตราก้าวหน้า (Hybrid Boundary)
 * - `condition = pay_always | pay_once` (มติ PO U105) ⇒ ภาษีของกลุ่มตาม `whtTaxForCondition()` · เกณฑ์เทียบกับ
 *   ฐานก่อนบวกภาษี · ผู้รับได้เงินเต็ม (`net` = ยอดรายการ) · `payoutGrossSatang` = ยอดรายการ + ส่วนแบ่งภาษี
 */
export function calculatePayeeBatchWht(
  items: readonly PayeeBatchWhtItem[],
  options: PayeeBatchWhtOptions = {},
): PayeeBatchWht {
  const incomeCategory = options.incomeCategory ?? 'sec_40_8'
  const condition: WhtCondition = options.condition ?? 'withhold'
  const payerBorne = isPayerBorneWhtCondition(condition)
  const hasIncludedItem = items.some((item) => item.includedInBase !== false)
  // 40(1)/40(2) ต้องมีอัตราต่อคน — ตรวจเฉพาะเมื่อมีรายการในฐานจริง (ทุกรายการไม่อยู่ในฐาน = ไม่มีอะไรให้หัก)
  const rate402 =
    usesPerPayeeWhtRate(incomeCategory) && hasIncludedItem ? section402Rate(options.section402Pct) : null
  const prepared = items.map((item) => {
    assertNonNegativeSatang(item.grossSatang, 'ยอดก่อนหักภาษี')
    assertNonNegativeSatang(item.vatSatang ?? 0, 'VAT ของรายการ')
    const includedInBase = item.includedInBase !== false
    // มติ PO U121 — รายการนอกฐาน WHT ไม่ resolve อัตรา (เดิมล้มด้วย RangeError เมื่อไม่มีแผน/Tax Profile)
    const resolved = includedInBase ? (rate402 ?? resolveWhtRate(item.source)) : NO_RATE
    const rateMissing = resolved === null
    const rate = resolved ?? NO_RATE
    const fullBase = rate.whtBasis === 'gross_amount' ? item.grossSatang + (item.vatSatang ?? 0) : item.grossSatang
    // ไม่มีอัตรา ⇒ ไม่นับเข้าฐาน/เกณฑ์ (ภาษี 0) แต่ยังคงสถานะ "อยู่ในฐาน" ไว้ให้ผู้เรียกบล็อก/เตือน
    const counted = includedInBase && !rateMissing
    return { item, rate, includedInBase, rateMissing, counted, baseSatang: counted ? fullBase : 0 }
  })
  if (prepared.length === 0) {
    return { lines: [], totalBaseSatang: 0, totalWhtSatang: 0, belowThreshold: true, incomeCategory, rateMissing: false }
  }

  const inBase = prepared.filter((entry) => entry.counted)
  const threshold = inBase[0]?.rate.minThresholdSatang ?? 0
  if (inBase.some((entry) => entry.rate.minThresholdSatang !== threshold)) {
    throw new RangeError('calculatePayeeBatchWht: เกณฑ์ขั้นต่ำ WHT ไม่เท่ากันภายใน payee เดียว — ต้องจัดกลุ่มต่อ payee ก่อน')
  }
  const totalBaseSatang = inBase.reduce((sum, entry) => sum + entry.baseSatang, 0)
  const belowThreshold = inBase.length === 0 || totalBaseSatang < threshold

  const whtByIndex = new Array<number>(prepared.length).fill(0)
  if (!belowThreshold) {
    const groups = new Map<number, number[]>()
    prepared.forEach((entry, index) => {
      if (!entry.counted) return
      const members = groups.get(entry.rate.whtPct) ?? []
      members.push(index)
      groups.set(entry.rate.whtPct, members)
    })
    for (const [pct, members] of groups) {
      const groupBase = members.reduce((sum, index) => sum + prepared[index]!.baseSatang, 0)
      // U105 — (2) ทบยอด / (1)(3) ตามอัตรา · ปัดครั้งเดียวต่อกลุ่มเหมือนเดิม
      const groupWht = whtTaxForCondition(groupBase, pct, condition)
      allocateLargestRemainder(groupWht, members.map((index) => prepared[index]!.baseSatang)).forEach(
        (share, position) => {
          whtByIndex[members[position]!] = share
        },
      )
    }
  }

  const lines = prepared.map((entry, index): PayeeBatchWhtLine => {
    const whtSatang = whtByIndex[index]!
    // ผู้จ่ายออกภาษีให้ ⇒ ผู้รับได้ยอดเต็ม · ภาษีบวกเข้าเงินได้ (gross) แทนการหักออก
    const payoutGrossSatang = payerBorne ? entry.item.grossSatang + whtSatang : entry.item.grossSatang
    return {
      baseSatang: entry.baseSatang,
      whtSatang,
      netSatang: payoutGrossSatang - whtSatang,
      payoutGrossSatang,
      whtCondition: condition,
      belowThreshold,
      whtPctUsed: entry.rate.whtPct,
      whtBasisUsed: entry.rate.whtBasis,
      rate: entry.rate,
      includedInBase: entry.includedInBase,
      incomeCategory,
      rateMissing: entry.rateMissing,
    }
  })
  return {
    lines,
    totalBaseSatang,
    totalWhtSatang: whtByIndex.reduce((sum, value) => sum + value, 0),
    belowThreshold,
    incomeCategory,
    rateMissing: prepared.some((entry) => entry.rateMissing),
  }
}

/**
 * แบ่ง `total` สตางค์ตามสัดส่วน `weights` แบบ largest remainder — ผลรวมเท่า `total` เสมอ
 * ใช้ BigInt คูณกันเพื่อไม่ให้ `total × weight` ล้น 2^53 (ยอดระดับร้อยล้านสตางค์ × ร้อยล้าน)
 */
export function allocateLargestRemainder(total: number, weights: readonly number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  if (weightSum === 0) return weights.map(() => 0)
  const bigTotal = BigInt(total)
  const bigSum = BigInt(weightSum)
  const shares = weights.map((weight) => {
    const numerator = bigTotal * BigInt(weight)
    return { floor: numerator / bigSum, remainder: numerator % bigSum }
  })
  let leftover = total - shares.reduce((sum, share) => sum + Number(share.floor), 0)
  const order = shares
    .map((share, index) => ({ index, remainder: share.remainder }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1))
  const result = shares.map((share) => Number(share.floor))
  for (const { index } of order) {
    if (leftover <= 0) break
    result[index]! += 1
    leftover -= 1
  }
  return result
}

/**
 * **A1 — WHT ที่ "ลูกค้าหักจากเรา" ก่อนโอน** (มติ PO 2026-08-12 · `02_OPEN_DECISIONS` A1)
 *
 * คนละทิศกับ §6.9 ข้างบน (นั่นคือ *เราหักคนอื่น*) — ตัวนี้คือบริษัทไฟแนนซ์หักภาษีจากค่าบริการของเรา
 * ก่อนโอน ⇒ เงินเข้าบัญชีจริง = `total − wht` และส่วนต่างคือ **เครดิตภาษีของบริษัท** ไม่ใช่หนี้ค้าง
 *
 * - อัตรามาจาก `finance_companies.wht_withheld_by_customer_pct` (ตั้งต่อบริษัท · `NULL` = ไม่หัก)
 * - **ฐาน = ยอดก่อน VAT** ตามกติกาเหล็กของโปรเจกต์ (Rule 01 — WHT ฐาน `before_vat` เสมอ)
 * - **ไม่มีเกณฑ์ขั้นต่ำ** — เกณฑ์ 1,000 บาทของ §6.9 ผูกกับ `tax_profiles` ของผู้รับเงินฝั่งเรา
 *   ซึ่งไม่มีในทิศนี้ · ค่านี้เป็นเพียง "ยอดที่คาดว่าจะถูกหัก" ที่ใช้เป็น**ทางเลือก**ของการจับคู่
 *   (`altAmountSatang`) — ยอดเต็มยังจับคู่ได้เหมือนเดิมเสมอ ⇒ คาดผิดไม่ทำให้จับคู่พลาด
 *   🔶 อัตราจริงรายบริษัทยังรอนักบัญชียืนยันก่อนวางบิลจริงใบแรก (open item A1 เดิม)
 */
export function calculateCustomerWithheldWht(input: {
  /** ยอดรายได้ของรอบวางบิล **ก่อน VAT** (`billing_batches` = ผลรวม `revenues.gross_satang`) */
  amountBeforeVatSatang: number
  /** `finance_companies.wht_withheld_by_customer_pct` — `null` = บริษัทนี้ไม่หักภาษีก่อนโอน */
  whtPct: number | null
}): number {
  assertNonNegativeSatang(input.amountBeforeVatSatang, 'ยอดรายได้ก่อน VAT ของรอบวางบิล')
  if (input.whtPct === null || input.whtPct === 0) return 0
  assertWhtPctValid(input.whtPct)
  return pctOfSatang(input.amountBeforeVatSatang, input.whtPct)
}

/**
 * ภาษีที่ลูกค้าจะหัก ณ ที่จ่าย **(ประมาณ)** + ยอดที่คาดว่าจะได้รับ ของรอบวางบิล (UAT BUG-165)
 * — แสดงบนรอบร่าง/รายละเอียดรอบให้การเงินเห็นก่อนเงินเข้า · **ไม่บันทึกลง DB** (ยอดหักจริงบันทึกตอนจับคู่เงินรับ)
 *
 * - บันทึกยอดหักจริงแล้ว (`recordedWhtSatang > 0`) ⇒ ใช้ยอดจริง (`isEstimate = false`)
 * - ยังไม่มี ⇒ ประมาณจากอัตราของบริษัทด้วยสูตรเดียวกับ `calculateCustomerWithheldWht()` (ฐานก่อน VAT)
 * - ยอดที่คาดว่าจะได้รับ = ยอดเรียกเก็บรวม VAT − ภาษีที่ลูกค้าหัก (ไม่ติดลบ)
 */
export function estimateCustomerWhtForBilling(input: {
  amountBeforeVatSatang: number
  totalSatang: number
  recordedWhtSatang: number
  whtPct: number | null
}): { whtSatang: number; isEstimate: boolean; expectedReceiptSatang: number } {
  assertNonNegativeSatang(input.totalSatang, 'ยอดเรียกเก็บของรอบวางบิล')
  assertNonNegativeSatang(input.recordedWhtSatang, 'ภาษีที่ลูกค้าหักที่บันทึกแล้ว')
  const isEstimate = input.recordedWhtSatang === 0
  const whtSatang = isEstimate
    ? calculateCustomerWithheldWht({ amountBeforeVatSatang: input.amountBeforeVatSatang, whtPct: input.whtPct })
    : input.recordedWhtSatang
  return { whtSatang, isEstimate, expectedReceiptSatang: Math.max(0, input.totalSatang - whtSatang) }
}
