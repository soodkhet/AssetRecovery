import { signedAdjustmentSatang } from '@/lib/adjustments/adjustment'
import { allocateLargestRemainder } from '@/lib/finance/wht-calc'
import type { AdjustmentType } from '@/lib/generated/prisma/enums'

/**
 * **Adjustment ระดับรอบวางบิล → รายได้รายเคส** (มติ PO 05/10/2569 U69) — pure ล้วน
 *
 * รายงาน F2 จัดกลุ่มรายได้ทีละใบ (เดือน/ไตรมาส/บริษัท) แต่ Adjustment ที่ผูก "รอบวางบิล" ไม่ได้ชี้รายได้ใบใด
 * ⇒ กระจายยอดลงรายได้ทุกใบ**ในรอบนั้น**ตามสัดส่วน `grossSatang` (ยอดก่อน VAT ก่อนปรับปรุง) ด้วย largest remainder
 * — วิธีเดียวกับกราฟรายได้พอร์ทัล (`allocateDocumentedRevenue()` มติ U14 · ตัวแบ่งกลาง `allocateLargestRemainder()`)
 *
 * ### กติกา
 * - กระจาย**ทีละ Adjustment** ⇒ ผลรวมส่วนแบ่งของแต่ละรายการ = ยอดของรายการนั้นพอดี (ไม่หายเศษสตางค์)
 *   และบรรทัดกระทบยอด (U44) แยก "มีใบลดหนี้แล้ว/ยังรอ" ได้ทีละรายการ
 * - ฐานการกระจาย = รายได้**ทุกใบของรอบ** (ไม่ใช่เฉพาะใบในช่วงรายงาน) ⇒ รอบที่คร่อมเดือนแบ่งยอดไปตามเดือนของรายได้
 *   รายงานเดือนใดก็นับเฉพาะส่วนของรายได้ในเดือนนั้น — รวมทุกเดือนแล้วเท่ายอด Adjustment เสมอ
 * - เรียงสมาชิกตาม `id` ก่อนแบ่ง ⇒ เศษสตางค์ลงใบเดิมทุกครั้งที่ออกรายงาน (deterministic)
 * - รายได้ทุกใบในรอบเป็น 0 (หรือติดลบ) ⇒ แบ่งเท่ากัน (ยอดไม่หายไปไหน)
 * - เครื่องหมายใช้ `signedAdjustmentSatang()` (ลด = ลบ · เพิ่ม = บวก) — ไม่มีสูตรเงินใหม่
 */

export interface BatchRevenueMember {
  id: string
  billingBatchId: string | null
  grossSatang: number
}

export interface BatchLevelAdjustment {
  billingBatchId: string
  adjustmentType: AdjustmentType
  /** ยอดบวกเสมอ (เครื่องหมายมาจาก `adjustmentType`) */
  amountSatang: number
}

/** สมาชิกของรอบเรียงตาม `id` — ฐานเดียวกันทุกจุดที่เรียก */
function membersOf(revenues: readonly BatchRevenueMember[], billingBatchId: string): BatchRevenueMember[] {
  return revenues
    .filter((row) => row.billingBatchId === billingBatchId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * แบ่งยอด (ไม่ติดเครื่องหมาย) ของ Adjustment ระดับรอบ 1 รายการลงรายได้ในรอบ — คืน `revenueId → สตางค์`
 * ผลรวม = `amountSatang` เสมอเมื่อรอบมีรายได้อย่างน้อย 1 ใบ · รอบไม่มีรายได้ ⇒ Map ว่าง
 */
export function allocateBatchAdjustment(
  amountSatang: number,
  revenues: readonly BatchRevenueMember[],
  billingBatchId: string,
): Map<string, number> {
  const members = membersOf(revenues, billingBatchId)
  if (members.length === 0) return new Map()
  const weights = members.map((row) => Math.max(0, row.grossSatang))
  const usable = weights.some((weight) => weight > 0) ? weights : members.map(() => 1)
  const shares = allocateLargestRemainder(amountSatang, usable)
  return new Map(members.map((row, index) => [row.id, shares[index] ?? 0]))
}

/**
 * ผลรวม (ติดเครื่องหมาย) ของ Adjustment ระดับรอบทุกรายการต่อรายได้ — ใช้บวกกับยอดหลัง Adjustment
 * ระดับรายได้ของ F2 (`22` §6.12) · รายได้ที่ไม่มีส่วนแบ่ง = ไม่มีคีย์ (ถือเป็น 0)
 */
export function batchAdjustmentSharesByRevenue(
  revenues: readonly BatchRevenueMember[],
  adjustments: readonly BatchLevelAdjustment[],
): Map<string, number> {
  const result = new Map<string, number>()
  for (const adjustment of adjustments) {
    const sign = signedAdjustmentSatang(adjustment.adjustmentType, adjustment.amountSatang) < 0 ? -1 : 1
    for (const [revenueId, share] of allocateBatchAdjustment(adjustment.amountSatang, revenues, adjustment.billingBatchId)) {
      if (share === 0) continue
      result.set(revenueId, (result.get(revenueId) ?? 0) + sign * share)
    }
  }
  return result
}

/**
 * ส่วนของ Adjustment ระดับรอบ 1 รายการที่ตกอยู่กับรายได้ในช่วงรายงาน (ไม่ติดเครื่องหมาย) —
 * ให้บรรทัดกระทบยอด U44 นับยอดชุดเดียวกับที่ F2 นับ
 */
export function batchAdjustmentShareInRange(
  adjustment: BatchLevelAdjustment,
  revenues: readonly BatchRevenueMember[],
  inRangeRevenueIds: ReadonlySet<string>,
): number {
  let total = 0
  for (const [revenueId, share] of allocateBatchAdjustment(adjustment.amountSatang, revenues, adjustment.billingBatchId)) {
    if (inRangeRevenueIds.has(revenueId)) total += share
  }
  return total
}
