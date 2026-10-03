import { pctOfSatang } from '@/lib/finance/satang'
import { fmtSatangSymbol } from '@/lib/format/money'
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
 * เงินเป็น **สตางค์จำนวนเต็ม** ทุกจุด (Rule 01) — ส่วนของ `rate` คูณผ่าน `pctOfSatang()` ตัวเดียวของระบบ
 * (`lib/finance/satang.ts`) ห้ามเขียนสูตร `%` ซ้ำที่นี่: ค่านี้ถูกเขียนลง `cases.projected_revenue_satang`
 * แล้วผู้ใช้เอาไปเทียบกับยอดวางบิลจริง — ปัดคนละแบบ = ต่างกัน 1 สตางค์ (เช่น ฐาน 1,001,000 × 2.05%)
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

  const rateComponent = pctOfSatang(base, template.ratePct)
  const amountSatang = template.model === 'HYBRID' ? template.baseSatang + rateComponent : rateComponent
  return { amountSatang, source, basisSatang: base, missingBasis: false }
}

// ── แปล `calculation_source` เป็นข้อความสำหรับผู้ใช้ (UAT BUG-034) ─────────────

export interface ProjectedRevenueSourceParts {
  model: ServiceFeeModel | null
  templateId: string | null
  templateVersion: number | null
  baseSatang: number | null
  ratePct: number | null
  basis: ServiceFeeBasis | null
}

const MODELS: readonly ServiceFeeModel[] = ['SUCCESS_FEE', 'FLAT', 'HYBRID']
const BASES: readonly ServiceFeeBasis[] = ['debt_amount', 'asset_value']

/** อ่านค่าดิบที่ `describe()` เขียนไว้กลับเป็นชิ้นส่วน — ชิ้นที่อ่านไม่ออกเป็น `null` (ค่าดิบใน DB ไม่เปลี่ยน) */
export function parseProjectedRevenueSource(source: string): ProjectedRevenueSourceParts {
  const parts: ProjectedRevenueSourceParts = {
    model: null,
    templateId: null,
    templateVersion: null,
    baseSatang: null,
    ratePct: null,
    basis: null,
  }
  for (const token of source.split('·').map((piece) => piece.trim())) {
    const version = /^v(\d+)$/.exec(token)
    if (version !== null) {
      parts.templateVersion = Number(version[1])
      continue
    }
    const [key, value] = token.split('=', 2)
    if (value === undefined) continue
    if (key === 'model') parts.model = MODELS.find((model) => model === value) ?? null
    else if (key === 'template') parts.templateId = value
    else if (key === 'base' && /^\d+$/.test(value)) parts.baseSatang = Number(value)
    else if (key === 'rate' && /^\d+(\.\d+)?%$/.test(value)) parts.ratePct = Number(value.slice(0, -1))
    else if (key === 'basis') parts.basis = BASES.find((basis) => basis === value) ?? null
  }
  return parts
}

const MODEL_SHORT_LABEL: Readonly<Record<ServiceFeeModel, string>> = {
  SUCCESS_FEE: 'Success Fee',
  FLAT: 'Flat Rate',
  HYBRID: 'Hybrid',
}

const BASIS_SHORT_LABEL: Readonly<Record<ServiceFeeBasis, string>> = {
  debt_amount: 'มูลหนี้',
  asset_value: 'มูลค่าเครื่อง',
}

/**
 * ข้อความอ่านง่ายของที่มาประมาณการ เช่น `เทมเพลต "ค่าบริการมาตรฐาน" v2 · Hybrid: ฿500.00 + 15% ของมูลหนี้`
 * — `templateName` มาจากการ lookup ฝั่ง server (ค่าดิบเก็บแค่ template id) · ไม่มีชื่อ = แสดงแค่เวอร์ชัน
 * · ค่าดิบที่อ่านไม่ออก (ไม่มี model) คืน `null` ให้ UI แสดงข้อความกลางแทน — ไม่โชว์ UUID/ค่าดิบ
 */
export function projectedRevenueSourceText(source: string, templateName: string | null): string | null {
  const parts = parseProjectedRevenueSource(source)
  if (parts.model === null) return null

  const template = [templateName === null ? 'เทมเพลต' : `เทมเพลต "${templateName}"`]
  if (parts.templateVersion !== null) template.push(`v${parts.templateVersion}`)

  const base = parts.baseSatang === null ? null : fmtSatangSymbol(parts.baseSatang)
  const rate =
    parts.ratePct === null ? null : `${parts.ratePct}% ของ${BASIS_SHORT_LABEL[parts.basis ?? 'debt_amount']}`
  const pieces = parts.model === 'FLAT' ? [base] : parts.model === 'SUCCESS_FEE' ? [rate] : [base, rate]
  const formula = pieces.filter((piece): piece is string => piece !== null).join(' + ')

  const model = MODEL_SHORT_LABEL[parts.model]
  return `${template.join(' ')} · ${formula === '' ? model : `${model}: ${formula}`}`
}
