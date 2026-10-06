import type { TaxProfileIncomeType, WhtFilingForm } from '@/lib/generated/prisma/enums'
import { SettingsError } from '@/lib/settings/errors'
import { INCOME_TYPE_TEXT_CORPORATE } from '@/lib/settings/wht-policy'

/**
 * กติกาภาษี Payee (`13` §6.4) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * ค่ามาตรฐานไทย (มิ.ย. 2569): ค่าจ้างทำของ/ค่าบริการ ม.40(7)/(8) หัก **3%** ทั้งบุคคลธรรมดา
 * และนิติบุคคลไทย · ฐานหัก **ก่อน VAT** · ไม่หักเมื่อยอดต่ำกว่า **1,000 บาท**
 * — ทั้งหมดเป็น **ค่าตั้งได้ ห้าม hardcode** ในสูตร (Rule 01 · `22` §6.9)
 *
 * ⚠️ ความต่างจาก `13` §6.4 ที่ต้องรู้ (ยึด `02` §5 ตามลำดับความสำคัญเอกสาร):
 *  · `vat_mode` ไม่ได้อยู่บน `tax_profiles` — VAT mode เป็นของ **บริษัทไฟแนนซ์ฝั่งขาย**
 *    (`finance_companies.vat_mode`) ไม่ใช่ของผู้รับเงินฝั่งจ่าย
 *  · `applies_to` ไม่มีคอลัมน์ — ชนิดผู้รับเงินอยู่ที่ `payee_profiles.payee_type`
 *    (`individual`/`corporate`) และสะท้อนที่ `filing_form` (ภ.ง.ด.3 / ภ.ง.ด.53) ของ profile
 *  · ทั้งสองกรณีตรงกับ §6.4 ที่ยืนยันว่า **ไม่มี `inhouse_employee`** (เงินเดือนประจำอยู่นอกระบบ)
 */

/** อัตรา WHT มาตรฐาน (%) — ใช้เป็นค่าเริ่มต้นของฟอร์มเท่านั้น ห้ามใช้ในสูตรคำนวณ */
export const DEFAULT_WHT_PCT = 3
/** เกณฑ์ขั้นต่ำมาตรฐาน 1,000 บาท = 100,000 สตางค์ (Rule 01 — เงินเป็น satang เสมอ) */
export const DEFAULT_WHT_MIN_THRESHOLD_SATANG = 100_000

export const WHT_BASIS_VALUES = ['before_vat', 'gross_amount'] as const
export type WhtBasis = (typeof WHT_BASIS_VALUES)[number]

// ── ประเภทเงินได้ (มติ PO U148 — Final Test ด่าน 5 ND-6) ─────────────────────
// เดิมพิมพ์อิสระแล้วพิมพ์ลง 50 ทวิ ตรง ๆ ⇒ เลือกจากรายการมาตรฐานของแถวเงินได้ที่หักตามคำสั่งกรมสรรพากร
// ม.3 เตรส บนแบบ 50 ทวิ (ค่าจ้างทำของ ค่าบริการ ค่าโฆษณา ค่าเช่า ค่าขนส่ง) + "อื่น ๆ (ระบุ)"
// ข้อความที่พิมพ์ลงใบ = ป้ายของรายการ **ตรงตัว** (ระบบเขียนให้ ไม่รับข้อความจากผู้ใช้) · `other` = ข้อความที่ระบุเอง

export const TAX_PROFILE_INCOME_TYPE_CODES = [
  'hire_of_work_40_8',
  'service_or_hire_of_work',
  'service',
  'advertising',
  'rent',
  'transport',
  'other',
] as const satisfies readonly TaxProfileIncomeType[]

export type StandardIncomeTypeCode = Exclude<TaxProfileIncomeType, 'other'>

/** ข้อความที่พิมพ์ลง 50 ทวิ ของรายการมาตรฐาน — SSOT เดียว (migration แปลงค่าเดิมด้วยข้อความชุดนี้) */
export const TAX_PROFILE_INCOME_TYPE_TEXT: Readonly<Record<StandardIncomeTypeCode, string>> = {
  hire_of_work_40_8: 'ค่าจ้างทำของ มาตรา 40(8)',
  service_or_hire_of_work: INCOME_TYPE_TEXT_CORPORATE,
  service: 'ค่าบริการ',
  advertising: 'ค่าโฆษณา',
  rent: 'ค่าเช่า',
  transport: 'ค่าขนส่ง',
}

/** ป้ายตัวเลือกบนฟอร์ม — รายการมาตรฐานใช้ข้อความเดียวกับที่พิมพ์ลงใบ */
export const TAX_PROFILE_INCOME_TYPE_OPTION_LABEL: Readonly<Record<TaxProfileIncomeType, string>> = {
  ...TAX_PROFILE_INCOME_TYPE_TEXT,
  other: 'อื่น ๆ (ระบุ)',
}

export const DEFAULT_TAX_PROFILE_INCOME_TYPE: StandardIncomeTypeCode = 'hire_of_work_40_8'

/** ข้อความประเภทเงินได้ที่เก็บ/พิมพ์ — รายการมาตรฐาน = ป้ายตรงตัว (ไม่สนข้อความที่ส่งมา) · `other` = ข้อความที่ระบุ */
export function incomeTypeTextOf(code: TaxProfileIncomeType, otherText: string): string {
  return code === 'other' ? otherText.replace(/\s+/g, ' ').trim() : TAX_PROFILE_INCOME_TYPE_TEXT[code]
}

/** ข้อความเดิม (ก่อน U148) → รหัส — ตรงป้ายรายการ (ตัดช่องว่างซ้อน) = รายการนั้น · ไม่ตรง = `other` */
export function incomeTypeCodeOf(text: string): TaxProfileIncomeType {
  const folded = text.replace(/\s+/g, ' ').trim()
  const found = (Object.keys(TAX_PROFILE_INCOME_TYPE_TEXT) as StandardIncomeTypeCode[]).find(
    (code) => TAX_PROFILE_INCOME_TYPE_TEXT[code] === folded,
  )
  return found ?? 'other'
}

export interface TaxProfileValues {
  name: string
  whtPct: number
  whtBasis: WhtBasis
  whtMinThresholdSatang: number
  incomeTypeCode: TaxProfileIncomeType
  /** ใช้เฉพาะ `incomeTypeCode = other` — รายการมาตรฐานถูกเขียนทับด้วยป้ายของรายการเสมอ */
  incomeType: string
  filingForm: WhtFilingForm
}

export function normalizeTaxProfileValues(input: TaxProfileValues): TaxProfileValues {
  return {
    name: input.name.trim(),
    whtPct: input.whtPct,
    whtBasis: input.whtBasis,
    whtMinThresholdSatang: input.whtMinThresholdSatang,
    incomeTypeCode: input.incomeTypeCode,
    incomeType: incomeTypeTextOf(input.incomeTypeCode, input.incomeType),
    filingForm: input.filingForm,
  }
}

/**
 * `INVALID_WHT_RATE` (`13` §10 · `24` §6.2) — ติดลบหรือเกิน 100 = reject
 * Zod ดักให้ชั้นหนึ่งแล้ว ตัวนี้เป็นยามของ service (จุดที่ค่ามาจาก import/job ไม่ผ่านฟอร์ม)
 */
export function assertWhtPctValid(whtPct: number): void {
  if (Number.isFinite(whtPct) && whtPct >= 0 && whtPct <= 100) return
  throw new SettingsError('INVALID_WHT_RATE', { detail: `wht_pct=${whtPct}` })
}

/** ฟอร์มนำส่งที่ควรใช้ตามชนิดผู้รับเงิน (`33` §6.1) — ฟอร์มตั้งค่าใช้เป็นค่าแนะนำ */
export function suggestedFilingForm(payeeType: 'individual' | 'corporate'): WhtFilingForm {
  return payeeType === 'corporate' ? 'PND53' : 'PND3'
}

/** payload ที่ลง audit (`90` §13 — ภาษี = ต้องมี reason ทุก mutation) */
export function toTaxProfileAuditPayload(values: TaxProfileValues): Record<string, unknown> {
  return {
    name: values.name,
    wht_pct: values.whtPct,
    wht_basis: values.whtBasis,
    wht_min_threshold_satang: values.whtMinThresholdSatang,
    income_type_code: values.incomeTypeCode,
    income_type: values.incomeType,
    filing_form: values.filingForm,
  }
}
