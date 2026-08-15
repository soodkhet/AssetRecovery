import { calculateServiceFeeRevenue, type ServiceFeeBasisValues } from '@/lib/finance/service-fee-calc'
import { calculateVatForRevenue } from '@/lib/finance/vat-calc'
import type { CaseOutcome, ServiceFeeBasis, ServiceFeeModel, VatMode } from '@/lib/generated/prisma/enums'
import type { VatRatePeriod } from '@/lib/settings/vat'

/**
 * ประกอบ "แถว `revenues` หนึ่งใบ" จาก snapshot ของเคส (`19` §7.1) — **pure ล้วน ไม่มี I/O**
 *
 * เป็นตัวต่อ 2 สูตรของ `22` เข้าด้วยกันที่เดียว: ยอดค่าบริการ (§6.5–6.7) → VAT (§6.8)
 * ⇒ RevenueService (ตอน lot confirm / expense approved) และงานย้อนหลังใด ๆ ใช้ตัวนี้ตัวเดียว
 *
 * ### กติกาที่ห้ามหลุด
 * - **ทุกค่าเป็น snapshot ของเคส** (`cases.service_fee_*` ตอน `approved` — `10` §9.2) ห้ามอ่านเทมเพลตสด
 * - **VAT ห้าม hardcode 7%** — อัตรามาจาก `vat_rate_history` ตาม `revenue_date` แล้ว snapshot ลงแถว
 *   · ไม่มีอัตราครอบคลุมวันนั้น ⇒ `calculateVatForRevenue()` โยน `VAT_RATE_NOT_FOUND` (ห้าม fallback)
 * - เคสที่ยังไม่มีฐานคำนวณ (`basis = asset_value` แต่เคสไม่ได้กรอกมูลค่าทรัพย์) ⇒ **ห้ามสร้าง Revenue**
 *   คืน `missingBasis` ให้ผู้เรียกข้ามเคสนั้นแล้วบันทึกเหตุผลลง audit (ไม่เดาเป็น 0)
 */

export interface CaseServiceFeeSnapshot {
  model: ServiceFeeModel
  baseSatang: number
  ratePct: number
  basis: ServiceFeeBasis | null
  chargeOnFail: boolean
}

export interface RevenueRowInput {
  snapshot: CaseServiceFeeSnapshot
  outcome: CaseOutcome
  basisValues: ServiceFeeBasisValues
  /** `finance_companies.vat_mode` ของบริษัทที่วางบิล (`10` §7.1) */
  vatMode: VatMode
  /** วันเกิดรายได้ = วันปิดงานของเคส ในรูป date-only (ดู `toBangkokDateOnly()`) */
  revenueDate: Date
  vatRatePeriods: readonly VatRatePeriod[]
}

export interface RevenueRowValues {
  grossSatang: number
  vatSatang: number
  totalSatang: number
  /** snapshot ลง `revenues.vat_rate_pct_used` — `no_vat` = 0 (ไม่ใช่อัตราปัจจุบัน) */
  vatRatePctUsed: number
  feeModelSnapshot: ServiceFeeModel
  /** คำอธิบายสูตรสำหรับ audit/หน้าจอ "ดูสูตร" — ไม่ใช่ตัวเลขที่เอาไปคิดต่อ */
  formula: string
}

export type RevenueRowResult =
  | { ok: true; values: RevenueRowValues }
  | { ok: false; reason: 'missing_basis' }

/**
 * `22` §6.5–6.8 — ยอดของ Revenue หนึ่งใบ
 * @throws `SettingsError('VAT_RATE_NOT_FOUND')` เมื่อโหมดต้องคิด VAT แต่ไม่มีอัตราครอบ `revenueDate`
 */
export function buildRevenueRow(input: RevenueRowInput): RevenueRowResult {
  const fee = calculateServiceFeeRevenue(input.snapshot, input.outcome, input.basisValues)
  if (fee.grossSatang === null) return { ok: false, reason: 'missing_basis' }

  const vat = calculateVatForRevenue({
    amountSatang: fee.grossSatang,
    vatMode: input.vatMode,
    revenueDate: input.revenueDate,
    vatRatePeriods: input.vatRatePeriods,
  })

  return {
    ok: true,
    values: {
      grossSatang: vat.grossSatang,
      vatSatang: vat.vatSatang,
      totalSatang: vat.totalSatang,
      vatRatePctUsed: vat.vatRatePctUsed,
      feeModelSnapshot: input.snapshot.model,
      formula: fee.formula,
    },
  }
}
