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

export interface PayeeBatchWhtItem {
  /** ยอดก่อนหักภาษีของรายการ (`payout_batch_items.gross_satang`) */
  grossSatang: number
  vatSatang?: number
  /** แหล่งอัตรา — Tax Profile ของ payee (เหมือนกันทุกรายการของ payee) + อัตราแผนที่ snapshot ไว้กับรายการ */
  source: WhtRateSource
}

export interface PayeeBatchWht {
  /** ผลต่อรายการ **ลำดับเดียวกับ input** — `net = gross − wht` ทุกแถว */
  lines: PayeeWhtResult[]
  /** ฐานหักรวมของ payee ในรอบจ่าย — ตัวที่ใช้เทียบเกณฑ์ขั้นต่ำ */
  totalBaseSatang: number
  /** ภาษีรวมของ payee ในรอบ = ผลรวม `lines[].whtSatang` เป๊ะ (ไม่มีเศษสตางค์หาย) */
  totalWhtSatang: number
  /** true = ฐานรวมของ payee ต่ำกว่าเกณฑ์ ⇒ ไม่หักทุกรายการ */
  belowThreshold: boolean
}

/**
 * **WHT ต่อ payee ต่อรอบจ่าย** (`22` §6.9 — มติ PO 03/10/2569 UAT Q5, BUG-014)
 *
 * เกณฑ์ขั้นต่ำ (ค่าเริ่มต้น ฿1,000) เทียบกับ **ฐานรวมของ payee ทั้งรอบจ่าย** ไม่ใช่ต่อรายการ แล้วกระจาย
 * ภาษีรวมกลับลงรายการ:
 * 1. resolve อัตราต่อรายการด้วย `resolveWhtRate()` (Payee ชนะ Plan — `18` §6.3)
 * 2. ฐานรวม < เกณฑ์ ⇒ ทุกรายการ wht = 0
 * 3. ไม่งั้นจัดกลุ่มตามอัตรา → ภาษีของกลุ่ม = `pctOfSatang(ฐานรวมของกลุ่ม, อัตรา)` (ปัดครั้งเดียวต่อกลุ่ม)
 * 4. กระจายภาษีของกลุ่มลงรายการตามสัดส่วนฐาน ด้วย **largest remainder** (ปัดลงก่อน แล้วแจกเศษทีละ
 *    1 สตางค์ให้รายการที่เศษมากสุด · เสมอกันให้รายการที่มาก่อน) ⇒ ผลรวมรายการ = ภาษีของกลุ่มเป๊ะ
 *
 * ทุกรายการต้องเป็นของ payee เดียวกัน (ผู้เรียกจัดกลุ่มเอง) — เกณฑ์ขั้นต่ำต่างกันในชุดเดียว = ข้อมูลพัง
 */
export function calculatePayeeBatchWht(items: readonly PayeeBatchWhtItem[]): PayeeBatchWht {
  const prepared = items.map((item) => {
    assertNonNegativeSatang(item.grossSatang, 'ยอดก่อนหักภาษี')
    assertNonNegativeSatang(item.vatSatang ?? 0, 'VAT ของรายการ')
    const rate = resolveWhtRate(item.source)
    const baseSatang = rate.whtBasis === 'gross_amount' ? item.grossSatang + (item.vatSatang ?? 0) : item.grossSatang
    return { item, rate, baseSatang }
  })
  if (prepared.length === 0) return { lines: [], totalBaseSatang: 0, totalWhtSatang: 0, belowThreshold: true }

  const threshold = prepared[0]!.rate.minThresholdSatang
  if (prepared.some((entry) => entry.rate.minThresholdSatang !== threshold)) {
    throw new RangeError('calculatePayeeBatchWht: เกณฑ์ขั้นต่ำ WHT ไม่เท่ากันภายใน payee เดียว — ต้องจัดกลุ่มต่อ payee ก่อน')
  }
  const totalBaseSatang = prepared.reduce((sum, entry) => sum + entry.baseSatang, 0)
  const belowThreshold = totalBaseSatang < threshold

  const whtByIndex = new Array<number>(prepared.length).fill(0)
  if (!belowThreshold) {
    const groups = new Map<number, number[]>()
    prepared.forEach((entry, index) => {
      const members = groups.get(entry.rate.whtPct) ?? []
      members.push(index)
      groups.set(entry.rate.whtPct, members)
    })
    for (const [pct, members] of groups) {
      const groupBase = members.reduce((sum, index) => sum + prepared[index]!.baseSatang, 0)
      const groupWht = pctOfSatang(groupBase, pct)
      allocateLargestRemainder(groupWht, members.map((index) => prepared[index]!.baseSatang)).forEach(
        (share, position) => {
          whtByIndex[members[position]!] = share
        },
      )
    }
  }

  const lines = prepared.map((entry, index): PayeeWhtResult => {
    const whtSatang = whtByIndex[index]!
    return {
      baseSatang: entry.baseSatang,
      whtSatang,
      netSatang: entry.item.grossSatang - whtSatang,
      belowThreshold,
      whtPctUsed: entry.rate.whtPct,
      whtBasisUsed: entry.rate.whtBasis,
      rate: entry.rate,
    }
  })
  return { lines, totalBaseSatang, totalWhtSatang: whtByIndex.reduce((sum, value) => sum + value, 0), belowThreshold }
}

/**
 * แบ่ง `total` สตางค์ตามสัดส่วน `weights` แบบ largest remainder — ผลรวมเท่า `total` เสมอ
 * ใช้ BigInt คูณกันเพื่อไม่ให้ `total × weight` ล้น 2^53 (ยอดระดับร้อยล้านสตางค์ × ร้อยล้าน)
 */
function allocateLargestRemainder(total: number, weights: readonly number[]): number[] {
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
