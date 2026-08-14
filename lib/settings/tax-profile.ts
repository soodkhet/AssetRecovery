import type { WhtFilingForm } from '@/lib/generated/prisma/enums'
import { SettingsError } from '@/lib/settings/errors'

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

export interface TaxProfileValues {
  name: string
  whtPct: number
  whtBasis: WhtBasis
  whtMinThresholdSatang: number
  incomeType: string
  filingForm: WhtFilingForm
}

export function normalizeTaxProfileValues(input: TaxProfileValues): TaxProfileValues {
  return {
    name: input.name.trim(),
    whtPct: input.whtPct,
    whtBasis: input.whtBasis,
    whtMinThresholdSatang: input.whtMinThresholdSatang,
    incomeType: input.incomeType.trim(),
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
    income_type: values.incomeType,
    filing_form: values.filingForm,
  }
}
