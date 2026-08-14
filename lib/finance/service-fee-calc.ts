import { assertNonNegativeSatang, assertPct, pctOfSatang } from '@/lib/finance/satang'
import type { CaseOutcome, ServiceFeeBasis, ServiceFeeModel } from '@/lib/generated/prisma/enums'

/**
 * รายได้ค่าบริการต่อเคส (`22` §6.5–6.7) — **pure ล้วน ไม่มี I/O**
 *
 * นี่คือ **ยอดก่อน VAT** (`revenues.gross_satang`) — VAT คิดต่อที่ `lib/finance/vat-calc.ts` (§6.8)
 * และ "เกิดเมื่อไหร่" เป็นคนละเรื่อง อยู่ที่ `lib/finance/revenue-trigger-rules.ts` (§6.1 ของ `19`)
 *
 * ⚠️ ค่าที่รับเข้าต้องเป็น **snapshot ในตัวเคส** (`cases.service_fee_*` — `10` §9.2 snapshot ตอน
 * `approved`) ห้ามอ่านเทมเพลตปัจจุบันมาคิดย้อนหลัง (Rule 08)
 *
 * ⚠️ อย่าสับสนกับ `lib/cases/projected-revenue.ts` (`38` §6.5) ซึ่งเป็น **ประมาณการ best-case 100%**
 * ก่อนรับเคส — ตัวนั้นไม่สนใจ `charge_on_fail` และไม่ใช่ยอดที่วางบิลจริง
 */

/** snapshot เทมเพลตค่าบริการในตัวเคส (`02` §5 — `cases.service_fee_*`) */
export interface ServiceFeeSnapshot {
  model: ServiceFeeModel
  /** ใช้กับ `FLAT`/`HYBRID` */
  baseSatang: number
  /** ใช้กับ `SUCCESS_FEE`/`HYBRID` */
  ratePct: number
  /** ฐานคำนวณของส่วน rate — `null` เมื่อโมเดลไม่ใช้ (FLAT) */
  basis: ServiceFeeBasis | null
  /** ใช้กับ `FLAT`/`HYBRID` เท่านั้น — `SUCCESS_FEE` ไม่คิดเงินเมื่อไม่สำเร็จเสมอ */
  chargeOnFail: boolean
}

/** ฐานคำนวณจากตัวเคส (`38` §6.4) — `null` = เคสยังไม่กรอกยอดนั้น */
export interface ServiceFeeBasisValues {
  debtAmountSatang: number | null
  assetValueSatang: number | null
}

export interface ServiceFeeRevenue {
  /** ยอดก่อน VAT — `null` เมื่อยังคิดไม่ได้เพราะเคสไม่มีฐานคำนวณ (`missingBasis = true`) */
  grossSatang: number | null
  /** ส่วน base ที่ได้จริง (0 เมื่อ outcome ไม่เข้าเงื่อนไข `charge_on_fail`) */
  baseComponentSatang: number
  /** ส่วน `ฐาน × rate` ที่ได้จริง — ได้เฉพาะ `closed_success` เสมอ */
  rateComponentSatang: number
  /** ฐานคำนวณที่ใช้จริง (สตางค์) — `null` เมื่อโมเดลไม่ใช้ฐาน หรือเคสยังไม่กรอก */
  basisSatang: number | null
  /** true = ต้องใช้ฐานคำนวณแต่เคสยังไม่มีค่า ⇒ **ห้ามสร้าง Revenue** ต้องให้คนกรอกก่อน */
  missingBasis: boolean
  /** คำอธิบายสูตรสำหรับ modal "ดูสูตร" (`16` §8) และ audit — ไม่ใช่ตัวเลขที่เอาไปคิดต่อ */
  formula: string
}

function basisValueOf(basis: ServiceFeeBasis | null, values: ServiceFeeBasisValues): number | null {
  // `12` §7.1 — `basis` บังคับเมื่อมี rate; ค่า null ที่หลุดมาถือเป็นมูลหนี้ (ค่าเริ่มต้นเดียวกับ `38` §6.5)
  return basis === 'asset_value' ? values.assetValueSatang : values.debtAmountSatang
}

function basisLabel(basis: ServiceFeeBasis | null): string {
  return basis === 'asset_value' ? 'มูลค่าทรัพย์' : 'มูลหนี้'
}

/**
 * `22` §6.5–6.7 — ยอดค่าบริการก่อน VAT ตาม fee model และ outcome
 *
 * | model | `closed_success` | `closed_fail` |
 * |---|---|---|
 * | `SUCCESS_FEE` | `ฐาน × rate` | `0` เสมอ (ไม่มี `charge_on_fail`) |
 * | `FLAT` | `base` | `base` ถ้า `charge_on_fail` มิฉะนั้น `0` |
 * | `HYBRID` | `base + (ฐาน × rate)` | `base` ถ้า `charge_on_fail` มิฉะนั้น `0` (ส่วน rate ไม่ได้เลย) |
 */
export function calculateServiceFeeRevenue(
  snapshot: ServiceFeeSnapshot,
  outcome: CaseOutcome,
  values: ServiceFeeBasisValues,
): ServiceFeeRevenue {
  assertNonNegativeSatang(snapshot.baseSatang, 'ค่าบริการส่วน base')
  assertPct(snapshot.ratePct, 'อัตราค่าบริการ')

  const isSuccess = outcome === 'closed_success'
  const usesBase = snapshot.model !== 'SUCCESS_FEE'
  const usesRate = snapshot.model !== 'FLAT'

  // ส่วน base: `SUCCESS_FEE` ไม่มี · `FLAT`/`HYBRID` ได้เมื่อสำเร็จ หรือเมื่อ charge_on_fail = true
  const baseComponentSatang = usesBase && (isSuccess || snapshot.chargeOnFail) ? snapshot.baseSatang : 0

  // ส่วน rate: ได้เฉพาะ closed_success เสมอ ไม่มีเงื่อนไข charge_on_fail (`22` §6.7)
  if (!usesRate || !isSuccess) {
    return {
      grossSatang: baseComponentSatang,
      baseComponentSatang,
      rateComponentSatang: 0,
      basisSatang: null,
      missingBasis: false,
      formula: describeFormula(snapshot, outcome, null, baseComponentSatang, 0),
    }
  }

  const basisSatang = basisValueOf(snapshot.basis, values)
  if (basisSatang === null) {
    return {
      grossSatang: null,
      baseComponentSatang,
      rateComponentSatang: 0,
      basisSatang: null,
      missingBasis: true,
      formula: describeFormula(snapshot, outcome, null, baseComponentSatang, 0),
    }
  }

  assertNonNegativeSatang(basisSatang, `ฐานคำนวณ (${basisLabel(snapshot.basis)})`)
  const rateComponentSatang = pctOfSatang(basisSatang, snapshot.ratePct)

  return {
    grossSatang: baseComponentSatang + rateComponentSatang,
    baseComponentSatang,
    rateComponentSatang,
    basisSatang,
    missingBasis: false,
    formula: describeFormula(snapshot, outcome, basisSatang, baseComponentSatang, rateComponentSatang),
  }
}

function describeFormula(
  snapshot: ServiceFeeSnapshot,
  outcome: CaseOutcome,
  basisSatang: number | null,
  baseComponentSatang: number,
  rateComponentSatang: number,
): string {
  const parts: string[] = [`model=${snapshot.model}`, `outcome=${outcome}`]
  if (snapshot.model !== 'SUCCESS_FEE') {
    parts.push(`base=${baseComponentSatang}`, `charge_on_fail=${snapshot.chargeOnFail}`)
  }
  if (snapshot.model !== 'FLAT') {
    const basisText = basisSatang === null ? 'ยังไม่มีค่า' : String(basisSatang)
    parts.push(`${basisLabel(snapshot.basis)}=${basisText} × ${snapshot.ratePct}% = ${rateComponentSatang}`)
  }
  return parts.join(' · ')
}
