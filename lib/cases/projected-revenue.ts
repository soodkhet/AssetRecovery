import type { ServiceFeeBasis, ServiceFeeModel } from '@/lib/service-fee/template'

/**
 * ประมาณการรายได้ก่อนรับเคส (ไฟล์ 38 §6.5) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * ⚠️ นี่คือ **projection แบบ best-case 100%** ไม่ใช่ Revenue จริง:
 * - สมมติว่าเคสสำเร็จเสมอ (`38` §6.5) ⇒ ไม่ใช้ `charge_on_fail` และไม่คูณ success rate ใด ๆ
 * - ไม่ลง GL ไม่เข้าไฟล์ 19/31 — เก็บไว้แสดงประกอบการพิจารณารับเคสเท่านั้น
 * - สูตร Revenue **จริง** (`22` §6.5–6.7 รวมกรณี `closed_fail` + VAT/WHT) เป็น pure module ของ Phase 3.1
 *   ไฟล์นี้ห้ามถูกนำไปใช้แทน (Rule 01 — สูตรเงินจริงอยู่ `22` ที่เดียว)
 *
 * เงินเป็น **สตางค์จำนวนเต็ม** ทุกจุด (Rule 01) — ส่วนของ `rate` ปัดเป็นสตางค์เต็มด้วย `Math.round`
 * (ประมาณการอยู่แล้ว ไม่ใช่ยอดที่เรียกเก็บจริง)
 */

export interface ProjectedRevenueTemplate {
  model: ServiceFeeModel
  baseSatang: number
  ratePct: number
  basis: ServiceFeeBasis | null
  /** ใช้ประกอบ `calculation_source` เท่านั้น */
  templateId?: string
  templateName?: string
  templateVersion?: number
}

export interface ProjectedRevenueCaseValues {
  debtAmountSatang: number | null
  assetValueSatang: number | null
}

export interface ProjectedRevenue {
  /** ยอดประมาณการ (สตางค์) — `null` เมื่อยังคำนวณไม่ได้เพราะเคสยังไม่มีฐานคำนวณ */
  amountSatang: number | null
  /** `calculation_source` ที่เก็บลง `cases.projected_revenue_source` (`38` §6.4) */
  source: string
  /** ฐานคำนวณที่ใช้จริง (สตางค์) — `null` เมื่อโมเดลไม่ใช้ฐาน (FLAT) หรือเคสยังไม่กรอก */
  basisSatang: number | null
  /** ฐานคำนวณที่ยังไม่มีค่า ⇒ ยอดที่ได้ยังไม่สมบูรณ์ (FE แสดง "รอข้อมูล") */
  missingBasis: boolean
}

function basisValue(basis: ServiceFeeBasis | null, values: ProjectedRevenueCaseValues): number | null {
  if (basis === 'asset_value') return values.assetValueSatang
  // `12` §7.1 — `basis` บังคับเมื่อมี rate; ค่า null ที่หลุดมาถือเป็นมูลหนี้ตามค่าเริ่มต้นของ `38` §6.5
  return values.debtAmountSatang
}

function describe(template: ProjectedRevenueTemplate): string {
  const parts = [`model=${template.model}`]
  if (template.templateId !== undefined) parts.push(`template=${template.templateId}`)
  if (template.templateVersion !== undefined) parts.push(`v${template.templateVersion}`)
  if (template.model !== 'SUCCESS_FEE') parts.push(`base=${template.baseSatang}`)
  if (template.model !== 'FLAT') parts.push(`rate=${template.ratePct}%`, `basis=${template.basis ?? 'debt_amount'}`)
  return parts.join(' · ')
}

/**
 * `38` §6.5:
 * | FLAT        | = base                                  |
 * | SUCCESS_FEE | = ฐานคำนวณ × rate                        |
 * | HYBRID      | = base + (ฐานคำนวณ × rate)               |
 */
export function calculateProjectedRevenue(
  template: ProjectedRevenueTemplate,
  values: ProjectedRevenueCaseValues,
): ProjectedRevenue {
  const source = describe(template)

  if (template.model === 'FLAT') {
    return { amountSatang: template.baseSatang, source, basisSatang: null, missingBasis: false }
  }

  const base = basisValue(template.basis, values)
  if (base === null) {
    return { amountSatang: null, source, basisSatang: null, missingBasis: true }
  }

  const rateComponent = Math.round((base * template.ratePct) / 100)
  const amountSatang = template.model === 'HYBRID' ? template.baseSatang + rateComponent : rateComponent
  return { amountSatang, source, basisSatang: base, missingBasis: false }
}
