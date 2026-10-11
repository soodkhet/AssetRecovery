import { pctOfSatang } from '@/lib/finance/satang'
import type { AdjustmentStatus, AdjustmentType } from '@/lib/generated/prisma/enums'
import { allocateBatchAdjustment } from '@/lib/reports/finance/batch-adjustments'

/**
 * **Adjustment ลดยอดก่อนออกใบกำกับภาษี** — มติชั่วคราว M3 (mytester G-02 · 11/10/2569 — รอ PO/นักบัญชียืนยัน) · pure ล้วน
 *
 * ใบลดหนี้ (ม.86/10) ใช้แก้ใบกำกับภาษีที่**ออกไปแล้ว** ⇒ Adjustment ลดยอดที่อนุมัติ**ก่อน**รอบวางบิลมีใบกำกับ active ใบแรก
 * ไม่ต้องรอใบลดหนี้: ลดยอดเรียกเก็บตามเอกสาร/AR ของรอบทันที และใบกำกับที่ออกหลังจากนั้นคิดจากยอดหลังปรับ (`22` §6.8.2)
 *
 * ### กติกา (`20` §6.x · `19` §6.x)
 * - เข้าเงื่อนไข = อนุมัติแล้ว · ลดยอด · ไม่มีใบลดหนี้ active อ้างถึง · ไม่ได้ปิดป้าย "จัดการนอกระบบ" ·
 *   `approved_at` **ก่อน** เวลาออกใบกำกับ active ใบแรกของรอบ (ยังไม่มีใบ = เข้าเงื่อนไข)
 * - อนุมัติหลังมีใบกำกับแล้ว ⇒ ไม่เข้าเงื่อนไข ⇒ ต้องออกใบลดหนี้ตามเดิม (ป้าย "รอใบลดหนี้")
 * - Adjustment เพิ่มยอด **ไม่อยู่ในมตินี้** — คงกติกาใบเพิ่มหนี้เดิม (U19)
 * - ยอด Adjustment = ยอดก่อน VAT (`20` §7) · VAT ของส่วนที่ลด = `pctOfSatang(ยอด, อัตรา snapshot ของรายได้)` (`22` §6.8
 *   — `gross_satang` เก็บก่อน VAT ทุกโหมด) · ระดับรอบวางบิล ⇒ กระจายลงรายได้ในรอบด้วย `allocateBatchAdjustment()` (U69)
 *   แล้วคิด VAT รายใบ ⇒ ไม่มีสูตรเงินใหม่
 */

export interface PreInvoiceAdjustmentCandidate {
  status: AdjustmentStatus
  adjustmentType: AdjustmentType
  approvedAt: Date | null
  /** มีใบลดหนี้/ใบเพิ่มหนี้ active อ้างถึงแล้ว */
  hasActiveNote: boolean
  /** ปิดป้ายเป็น "จัดการนอกระบบ" แล้ว (staging E-016) */
  waived: boolean
}

/**
 * Adjustment รายการนี้ลดยอดของรอบ**ก่อน**ออกใบกำกับหรือไม่
 * @param firstActiveInvoiceAt เวลาออก (`created_at`) ของใบกำกับ active ใบแรกของรอบ — ยังไม่มี = `null`
 * @param asOf นับเฉพาะที่อนุมัติไม่เกินเวลานี้ (ยอด ณ วันที่ — ไม่ส่ง = ปัจจุบัน)
 */
export function isPreInvoiceDecrease(
  adjustment: PreInvoiceAdjustmentCandidate,
  firstActiveInvoiceAt: Date | null,
  asOf?: Date,
): boolean {
  if (adjustment.status !== 'approved' || adjustment.adjustmentType !== 'decrease') return false
  if (adjustment.hasActiveNote || adjustment.waived || adjustment.approvedAt === null) return false
  if (asOf !== undefined && adjustment.approvedAt.getTime() > asOf.getTime()) return false
  return firstActiveInvoiceAt === null || adjustment.approvedAt.getTime() < firstActiveInvoiceAt.getTime()
}

export interface PreInvoiceRevenue {
  id: string
  billingBatchId: string | null
  grossSatang: number
  /** `revenues.vat_rate_pct_used` (no_vat = 0) */
  vatRatePct: number
}

export interface PreInvoiceAdjustmentAmount {
  amountSatang: number
  /** Adjustment ระดับรายได้ ⇒ id รายได้ · ระดับรอบวางบิล ⇒ `null` */
  revenueId: string | null
}

export interface PreInvoiceAmounts {
  beforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

/** ส่วนลดก่อน VAT ต่อรายได้ (ระดับรายได้ = ตรงใบ · ระดับรอบ = กระจายตามสัดส่วน) — ใช้ทั้งยอดเอกสารและกราฟรายได้ */
export function preInvoiceSharesByRevenue(
  billingBatchId: string,
  adjustments: readonly PreInvoiceAdjustmentAmount[],
  revenues: readonly PreInvoiceRevenue[],
): { revenueId: string | null; amountSatang: number }[] {
  const shares: { revenueId: string | null; amountSatang: number }[] = []
  for (const adjustment of adjustments) {
    if (adjustment.revenueId !== null) {
      shares.push({ revenueId: adjustment.revenueId, amountSatang: adjustment.amountSatang })
      continue
    }
    const allocated = allocateBatchAdjustment(adjustment.amountSatang, revenues, billingBatchId)
    if (allocated.size === 0) {
      shares.push({ revenueId: null, amountSatang: adjustment.amountSatang })
      continue
    }
    for (const [revenueId, amountSatang] of allocated) {
      if (amountSatang !== 0) shares.push({ revenueId, amountSatang })
    }
  }
  return shares
}

/** ยอดที่ลดจากรอบ (ก่อน VAT / VAT / รวม) — VAT คิดรายใบด้วยอัตรา snapshot ของรายได้ใบนั้น (ไม่พบใบ = 0) */
export function preInvoiceAmounts(
  billingBatchId: string,
  adjustments: readonly PreInvoiceAdjustmentAmount[],
  revenues: readonly PreInvoiceRevenue[],
): PreInvoiceAmounts {
  const rateOf = new Map(revenues.map((revenue) => [revenue.id, revenue.vatRatePct]))
  let beforeVatSatang = 0
  let vatSatang = 0
  for (const share of preInvoiceSharesByRevenue(billingBatchId, adjustments, revenues)) {
    beforeVatSatang += share.amountSatang
    const rate = share.revenueId === null ? 0 : (rateOf.get(share.revenueId) ?? 0)
    vatSatang += rate === 0 ? 0 : pctOfSatang(share.amountSatang, rate)
  }
  return { beforeVatSatang, vatSatang, totalSatang: beforeVatSatang + vatSatang }
}
