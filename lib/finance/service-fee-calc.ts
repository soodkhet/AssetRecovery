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
 * ก่อนรับเคส — ตัวนั้นไม่สนใจยอดกรณีไม่สำเร็จ และไม่ใช่ยอดที่วางบิลจริง
 */

/** snapshot เทมเพลตค่าบริการในตัวเคส (`02` §5 — `cases.service_fee_*`) */
export interface ServiceFeeSnapshot {
  model: ServiceFeeModel
  /** ใช้กับ `FLAT`/`HYBRID` — ส่วน "กรณีสำเร็จ" */
  baseSatang: number
  /** ใช้กับ `SUCCESS_FEE`/`HYBRID` — ส่วน "กรณีสำเร็จ" */
  ratePct: number
  /** ฐานคำนวณของส่วน rate — `null` เมื่อโมเดลไม่ใช้ (FLAT) */
  basis: ServiceFeeBasis | null
  /**
   * มติ PO U165 — ยอดค่าบริการ "กรณีไม่สำเร็จ" (สตางค์) ใช้ได้**ทุกโมเดล** แยกจากส่วนกรณีสำเร็จ
   * `null` = ไม่เรียกเก็บกรณีไม่สำเร็จ (แทนสวิตช์ `charge_on_fail` เดิม)
   */
  failFeeSatang: number | null
}

/**
 * ฐานคำนวณจากตัวเคส (`38` §6.4) — `null` = เคสยังไม่กรอกยอดนั้น
 * มติ PO U126 — ฐานมีแบบเดียวคือยอดหนี้คงเหลือ (ตัดมูลค่าเครื่องออก)
 */
export interface ServiceFeeBasisValues {
  debtAmountSatang: number | null
}

export interface ServiceFeeRevenue {
  /** ยอดก่อน VAT — `null` เมื่อยังคิดไม่ได้เพราะเคสไม่มีฐานคำนวณ (`missingBasis = true`) */
  grossSatang: number | null
  /** ส่วน base ของกรณีสำเร็จที่ได้จริง (0 เมื่อ `closed_fail` หรือโมเดล `SUCCESS_FEE`) */
  baseComponentSatang: number
  /** ยอดกรณีไม่สำเร็จที่ได้จริง (มติ U165) — ได้เฉพาะ `closed_fail` · 0 เมื่อสำเร็จหรือเทมเพลตไม่เก็บ */
  failFeeComponentSatang: number
  /** ส่วน `ฐาน × rate` ที่ได้จริง — ได้เฉพาะ `closed_success` เสมอ */
  rateComponentSatang: number
  /** ฐานคำนวณที่ใช้จริง (สตางค์) — `null` เมื่อโมเดลไม่ใช้ฐาน หรือเคสยังไม่กรอก */
  basisSatang: number | null
  /** true = ต้องใช้ฐานคำนวณแต่เคสยังไม่มีค่า ⇒ **ห้ามสร้าง Revenue** ต้องให้คนกรอกก่อน */
  missingBasis: boolean
  /** คำอธิบายสูตรสำหรับ modal "ดูสูตร" (`16` §8) และ audit — ไม่ใช่ตัวเลขที่เอาไปคิดต่อ */
  formula: string
}

function basisValueOf(values: ServiceFeeBasisValues): number | null {
  // `12` §7.1 — `basis` บังคับเมื่อมี rate; ค่าเดียวที่เป็นไปได้คือ debt_amount (U126) และ null ที่หลุดมาก็ถือเป็นมูลหนี้
  return values.debtAmountSatang
}

/**
 * `22` §6.5–6.7 — ยอดค่าบริการก่อน VAT ตาม fee model และ outcome (มติ PO U165)
 *
 * | model | `closed_success` | `closed_fail` |
 * |---|---|---|
 * | `SUCCESS_FEE` | `ฐาน × rate` | `fail_fee ?? 0` |
 * | `FLAT` | `base` | `fail_fee ?? 0` |
 * | `HYBRID` | `base + (ฐาน × rate)` | `fail_fee ?? 0` |
 *
 * กรณีไม่สำเร็จไม่ใช้ base/rate เลย — ใช้ยอดกรณีไม่สำเร็จที่ตั้งแยกไว้เท่านั้น
 */
export function calculateServiceFeeRevenue(
  snapshot: ServiceFeeSnapshot,
  outcome: CaseOutcome,
  values: ServiceFeeBasisValues,
): ServiceFeeRevenue {
  assertNonNegativeSatang(snapshot.baseSatang, 'ค่าบริการส่วน base')
  assertPct(snapshot.ratePct, 'อัตราค่าบริการ')
  if (snapshot.failFeeSatang !== null) assertNonNegativeSatang(snapshot.failFeeSatang, 'ค่าบริการกรณีไม่สำเร็จ')

  if (outcome === 'closed_fail') {
    const failFeeComponentSatang = snapshot.failFeeSatang ?? 0
    return {
      grossSatang: failFeeComponentSatang,
      baseComponentSatang: 0,
      failFeeComponentSatang,
      rateComponentSatang: 0,
      basisSatang: null,
      missingBasis: false,
      formula: describeFormula(snapshot, outcome, null, 0, 0, failFeeComponentSatang),
    }
  }

  const usesBase = snapshot.model !== 'SUCCESS_FEE'
  const usesRate = snapshot.model !== 'FLAT'
  const baseComponentSatang = usesBase ? snapshot.baseSatang : 0

  if (!usesRate) {
    return {
      grossSatang: baseComponentSatang,
      baseComponentSatang,
      failFeeComponentSatang: 0,
      rateComponentSatang: 0,
      basisSatang: null,
      missingBasis: false,
      formula: describeFormula(snapshot, outcome, null, baseComponentSatang, 0, 0),
    }
  }

  const basisSatang = basisValueOf(values)
  if (basisSatang === null) {
    return {
      grossSatang: null,
      baseComponentSatang,
      failFeeComponentSatang: 0,
      rateComponentSatang: 0,
      basisSatang: null,
      missingBasis: true,
      formula: describeFormula(snapshot, outcome, null, baseComponentSatang, 0, 0),
    }
  }

  assertNonNegativeSatang(basisSatang, 'ฐานคำนวณ (มูลหนี้)')
  const rateComponentSatang = pctOfSatang(basisSatang, snapshot.ratePct)

  return {
    grossSatang: baseComponentSatang + rateComponentSatang,
    baseComponentSatang,
    failFeeComponentSatang: 0,
    rateComponentSatang,
    basisSatang,
    missingBasis: false,
    formula: describeFormula(snapshot, outcome, basisSatang, baseComponentSatang, rateComponentSatang, 0),
  }
}

function describeFormula(
  snapshot: ServiceFeeSnapshot,
  outcome: CaseOutcome,
  basisSatang: number | null,
  baseComponentSatang: number,
  rateComponentSatang: number,
  failFeeComponentSatang: number,
): string {
  const parts: string[] = [`model=${snapshot.model}`, `outcome=${outcome}`]
  if (outcome === 'closed_fail') {
    const failText = snapshot.failFeeSatang === null ? 'ไม่เก็บ' : String(failFeeComponentSatang)
    parts.push(`fail_fee=${failText}`)
    return parts.join(' · ')
  }
  if (snapshot.model !== 'SUCCESS_FEE') {
    parts.push(`base=${baseComponentSatang}`)
  }
  if (snapshot.model !== 'FLAT') {
    const basisText = basisSatang === null ? 'ยังไม่มีค่า' : String(basisSatang)
    parts.push(`มูลหนี้=${basisText} × ${snapshot.ratePct}% = ${rateComponentSatang}`)
  }
  return parts.join(' · ')
}
