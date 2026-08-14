import { assertNonNegativeSatang, assertPct, pctOfSatang, vatIncludedInSatang } from '@/lib/finance/satang'
import { SettingsError } from '@/lib/settings/errors'
import { resolveVatRateAt, type VatRatePeriod } from '@/lib/settings/vat'
import type { VatMode } from '@/lib/generated/prisma/enums'

/**
 * VAT ของรายได้ (`22` §6.8 · `19` §6.3 · `13` §6.5) — **pure ล้วน ไม่มี I/O**
 *
 * **ห้าม hardcode 7%** ทุกกรณี (Rule 01): อัตรามาจาก `vat_rate_history` ที่ effective ณ `revenue_date`
 * แล้ว **snapshot ลง `revenues.vat_rate_pct_used` เสมอ** — ตัว resolver ตามช่วงวันที่มีอยู่แล้วจาก
 * Phase 1.10 (`resolveVatRateAt()`) ไฟล์นี้ต่อยอดเป็น "อัตรา → ยอดเงิน" เท่านั้น
 *
 * ### เอกสารสองฉบับพูดคนละมุมของโหมด `include_vat` — สรุปให้ตรงกันทั้งคู่
 * - `22` §6.8: `include_vat` ⇒ `total_amount = revenue_gross` (ราคาที่ตกลง**รวม** VAT แล้ว ไม่บวกเพิ่ม)
 * - `19` §7.1 (+ `02` §5): `revenues.gross_satang` = **ยอดก่อน VAT** และ `total = gross + vat` เสมอ
 *
 * ⇒ โหมด `include_vat` จึงต้อง **ถอด VAT ออกจากราคาที่ตกลง**: `total = ราคาที่ตกลง`,
 * `vat = ราคา × rate/(100+rate)`, `gross = ราคา − vat` — ผลลัพธ์ตรงกับ `22` (ยอดเรียกเก็บไม่บวกเพิ่ม)
 * และตรงกับ `19`/`02` (คอลัมน์ gross เป็นยอดก่อน VAT, total = gross + vat) พร้อมกัน
 */

export interface VatCalculationInput {
  /** ยอดค่าบริการตามสูตร `22` §6.5–6.7 — ความหมายต่างกันตามโหมด (ดู header) */
  amountSatang: number
  /** `finance_companies.vat_mode` ของบริษัทที่วางบิล (ไม่ใช่ของผู้รับเงินฝั่งจ่าย) */
  vatMode: VatMode
  /** อัตราที่ resolve ได้ตาม `revenue_date` — `null` = หาไม่เจอ (บังคับ error เว้นแต่ `no_vat`) */
  vatRatePct: number | null
}

export interface VatCalculation {
  vatMode: VatMode
  /** ยอดก่อน VAT ที่ลง `revenues.gross_satang` */
  grossSatang: number
  vatSatang: number
  /** `gross + vat` = ยอดที่เรียกเก็บจริง ลง `revenues.total_satang` */
  totalSatang: number
  /** snapshot ลง `revenues.vat_rate_pct_used` — `no_vat` = 0 (ไม่ใช่อัตราปัจจุบัน) */
  vatRatePctUsed: number
}

/**
 * `22` §6.8 — คิด VAT จากอัตราที่ resolve มาแล้ว
 * โยน `VAT_RATE_NOT_FOUND` เมื่อโหมดต้องใช้ VAT แต่ไม่มีอัตราครอบคลุมวันที่นั้น (`24` §6.2 — **ห้าม fallback 7%**)
 */
export function calculateVat(input: VatCalculationInput): VatCalculation {
  assertNonNegativeSatang(input.amountSatang, 'ยอดค่าบริการ')

  if (input.vatMode === 'no_vat') {
    return {
      vatMode: input.vatMode,
      grossSatang: input.amountSatang,
      vatSatang: 0,
      totalSatang: input.amountSatang,
      vatRatePctUsed: 0,
    }
  }

  if (input.vatRatePct === null) {
    throw new SettingsError('VAT_RATE_NOT_FOUND', { detail: `vat_mode=${input.vatMode}` })
  }
  assertPct(input.vatRatePct, 'อัตรา VAT')

  if (input.vatMode === 'include_vat') {
    const vatSatang = vatIncludedInSatang(input.amountSatang, input.vatRatePct)
    return {
      vatMode: input.vatMode,
      grossSatang: input.amountSatang - vatSatang,
      vatSatang,
      totalSatang: input.amountSatang,
      vatRatePctUsed: input.vatRatePct,
    }
  }

  const vatSatang = pctOfSatang(input.amountSatang, input.vatRatePct)
  return {
    vatMode: input.vatMode,
    grossSatang: input.amountSatang,
    vatSatang,
    totalSatang: input.amountSatang + vatSatang,
    vatRatePctUsed: input.vatRatePct,
  }
}

/**
 * ทางลัดที่ Revenue service (Phase 3.6) ใช้จริง: หาอัตราตาม `revenue_date` แล้วคิดยอดในก้าวเดียว
 * — จุดเดียวที่ประกอบ resolver ของ `13` §6.5 เข้ากับสูตร `22` §6.8 (ห้ามประกอบเองซ้ำที่ service)
 */
export function calculateVatForRevenue(input: {
  amountSatang: number
  vatMode: VatMode
  revenueDate: Date
  vatRatePeriods: readonly VatRatePeriod[]
}): VatCalculation {
  // `no_vat` ไม่ต้องมีอัตราในระบบเลย — บริษัทที่ไม่คิด VAT ต้องออกบิลได้แม้ยังไม่ตั้ง vat_rate_history
  const period = input.vatMode === 'no_vat' ? null : resolveVatRateAt(input.revenueDate, input.vatRatePeriods)
  return calculateVat({
    amountSatang: input.amountSatang,
    vatMode: input.vatMode,
    vatRatePct: period === null ? null : period.ratePct,
  })
}
