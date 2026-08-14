import { assertNonNegativeSatang, assertPct, pctOfSatang } from '@/lib/finance/satang'
import {
  DEFAULT_WHT_MIN_THRESHOLD_SATANG,
  assertWhtPctValid,
  type WhtBasis,
} from '@/lib/settings/tax-profile'

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

/** ค่าที่ resolve ได้จริงว่าจะใช้อัตราไหน (`18` §6.3) */
export interface WhtRateResolution {
  whtPct: number
  whtBasis: WhtBasis
  minThresholdSatang: number
  /** `payee` = มี Tax Profile · `plan` = fallback ชั่วคราว (ต้องแสดง `warning`) */
  source: 'payee' | 'plan'
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
  /** `compensation_plans.wht_pct` ที่ snapshot ไว้กับรายการเบิก — ใช้เป็น fallback เท่านั้น */
  planWhtPct: number | null
}

/**
 * `18` §6.3 — Payee ชนะ Plan เสมอ · ไม่มี Tax Profile ⇒ fallback Plan + warning
 *
 * fallback ใช้ `wht_basis`/threshold **มาตรฐาน** (`before_vat` / 1,000 บาท) เพราะ Plan level เก็บแค่
 * อัตรา (`02` §5 — `compensation_plans.wht_pct` ตัวเดียว) ไม่มีฐานหักและเกณฑ์ขั้นต่ำของตัวเอง
 */
export function resolveWhtRate(source: WhtRateSource): WhtRateResolution {
  if (source.payeeTaxProfile !== null) {
    assertWhtPctValid(source.payeeTaxProfile.whtPct)
    assertNonNegativeSatang(source.payeeTaxProfile.whtMinThresholdSatang, 'เกณฑ์ขั้นต่ำ WHT')
    return {
      whtPct: source.payeeTaxProfile.whtPct,
      whtBasis: source.payeeTaxProfile.whtBasis,
      minThresholdSatang: source.payeeTaxProfile.whtMinThresholdSatang,
      source: 'payee',
    }
  }

  if (source.planWhtPct === null) {
    // ไม่ควรเกิด: `compensation_plans.wht_pct` เป็น NOT NULL (`02` §5) — หลุดมาถึงตรงนี้คือข้อมูลพัง
    throw new RangeError('resolveWhtRate: ไม่มีทั้ง Tax Profile ของผู้รับเงินและอัตราของแผนค่าตอบแทน')
  }
  assertWhtPctValid(source.planWhtPct)

  return {
    whtPct: source.planWhtPct,
    whtBasis: 'before_vat',
    minThresholdSatang: DEFAULT_WHT_MIN_THRESHOLD_SATANG,
    source: 'plan',
    warning: 'ผู้รับเงินยังไม่มีกติกาภาษี (Tax Profile) — ใช้อัตราจากแผนค่าตอบแทนชั่วคราว โปรดผูก Tax Profile โดยเร็ว',
  }
}

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
 * ทางลัดที่ Payout Batch (Phase 3.4) ใช้จริง: resolve อัตราตามลำดับ Payee → Plan แล้วคิดยอดในก้าวเดียว
 * — **จุดเดียว**ที่ประกอบกฎ priority ของ `18` เข้ากับสูตร `22` §6.9 (ห้ามประกอบเองซ้ำที่ service)
 */
export function calculateWhtForPayee(input: {
  grossSatang: number
  vatSatang?: number
  source: WhtRateSource
}): PayeeWhtResult {
  const rate = resolveWhtRate(input.source)
  const calculation = calculateWht({
    grossSatang: input.grossSatang,
    vatSatang: input.vatSatang,
    whtPct: rate.whtPct,
    whtBasis: rate.whtBasis,
    minThresholdSatang: rate.minThresholdSatang,
  })
  return { ...calculation, rate }
}
