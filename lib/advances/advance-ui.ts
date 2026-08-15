import { canAdvanceAction } from '@/lib/advances/advance'
import type { AdvanceDto } from '@/lib/advances/types'
import type { AdvanceStatus } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ป้าย/สี/สิทธิ์ปุ่มของหน้าจอเงินทดรองจ่าย (`15` §8) — **pure ล้วน**
 *
 * ⚠️ หน้าจอ **ห้าม if สถานะเอง** — การเปลี่ยนสถานะยังผ่าน `advance.ts` (state machine `23` §6.4)
 * ⚠️ `overdue` ต้องเป็น **แดงเด่นชัดแยกจาก approved** (`15` §8) — สีมาจาก 10 กลุ่มของ `04` §8.1
 */

export const ADVANCE_STATUS_LABEL: Readonly<Record<AdvanceStatus, string>> = {
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว — รอเคลียร์ยอด',
  overdue: 'เลยกำหนดเคลียร์',
  cleared: 'เคลียร์ยอดแล้ว',
  rejected: 'ไม่อนุมัติ',
}

const ADVANCE_STATUS_GROUP: Readonly<Record<AdvanceStatus, StatusBadgeGroup>> = {
  pending_approval: 'pending',
  approved: 'sent',
  // `15` §8 — เลยกำหนดแล้วต้องเห็นทันทีว่าเป็นปัญหา
  overdue: 'critical',
  cleared: 'cleared',
  rejected: 'critical',
}

export function advanceStatusLabel(status: AdvanceStatus): string {
  return ADVANCE_STATUS_LABEL[status]
}

export function advanceStatusBadgeGroup(status: AdvanceStatus): StatusBadgeGroup {
  return ADVANCE_STATUS_GROUP[status]
}

/** ปุ่มอนุมัติ/ปฏิเสธ (การเงิน) — โผล่เฉพาะรายการที่ยังรออนุมัติ */
export function canReviewAdvance(status: AdvanceStatus): boolean {
  return canAdvanceAction(status, 'approve')
}

/** ปุ่ม "เคลียร์ยอด" — ทำได้ทั้ง `approved` และ `overdue` (`15` §9.1) */
export function canSettleAdvance(status: AdvanceStatus): boolean {
  return canAdvanceAction(status, 'settle')
}

/** แถวที่ยังถือเงินทดรองอยู่ — ใช้ขึ้นแถบเตือนหัวตาราง (`15` §8 · mockup `finance.html`) */
export function countAwaitingSettlement(items: readonly AdvanceDto[]): number {
  return items.filter((item) => canSettleAdvance(item.status)).length
}

export function countOverdue(items: readonly AdvanceDto[]): number {
  return items.filter((item) => item.status === 'overdue').length
}

/**
 * ยอดเงินบริษัทที่ยังอยู่ในมือผู้เบิก (`15` §8 แถบเตือนหัวตาราง) — นับจาก **ยอดที่อนุมัติจริง**
 * ของรายการที่ยังไม่เคลียร์เท่านั้น (ยอดที่ยังรออนุมัติยังไม่ใช่เงินที่ออกไป)
 *
 * `approvedSatang` เป็น `null` ได้เฉพาะรายการที่ยังไม่อนุมัติ ซึ่งถูกกรองออกไปแล้วโดย
 * `canSettleAdvance()` — เหลือ `?? 0` ไว้เป็นยามท้ายทาง ไม่ให้ยอดรวมกลายเป็น `NaN`
 */
export function outstandingAdvanceSatang(items: readonly AdvanceDto[]): number {
  return items
    .filter((item) => canSettleAdvance(item.status))
    .reduce((total, item) => total + (item.approvedSatang ?? 0), 0)
}

/** ตัวกรองสถานะของแท็บ "เงินทดรองจ่าย" — ค่าตรงกับ `status` ของ `GET /api/advances` (`15` §14) */
export const ADVANCE_STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending_approval', label: 'รออนุมัติ' },
  { value: 'uncleared', label: 'ยังไม่เคลียร์' },
  { value: 'overdue', label: 'เลยกำหนด' },
  { value: 'cleared', label: 'เคลียร์แล้ว' },
  { value: 'rejected', label: 'ไม่อนุมัติ' },
] as const satisfies readonly { value: string; label: string }[]

export type AdvanceStatusFilter = (typeof ADVANCE_STATUS_FILTERS)[number]['value']
