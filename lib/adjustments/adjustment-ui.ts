import {
  ADJUSTMENT_TARGET_LABEL,
  canTransitionAdjustment,
  type AdjustmentTargetType,
} from '@/lib/adjustments/adjustment'
import type { AdjustmentStatus, AccountingPeriodStatus, AdjustmentType } from '@/lib/generated/prisma/enums'
import { periodLockPolicyFor } from '@/lib/settings/period-lock'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ป้าย/สี/ปุ่มของแท็บ "ปรับปรุง" (`20` §8 · mockup `finance.html` แท็บ `adjustment`)
 * — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ⚠️ ปุ่มถาม `canActOnAdjustment()` ซึ่งอ่านตาราง transition ชุดเดียวกับ API (`23` §6.9)
 * ⚠️ ป้ายสถานะรอบบัญชีมาจาก `periodLockPolicyFor()` (`13` §6.11) ห้ามตั้งข้อความเองซ้ำ
 */

export const ADJUSTMENT_STATUS_LABEL: Readonly<Record<AdjustmentStatus, string>> = {
  pending_approval: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
}

const ADJUSTMENT_STATUS_GROUP: Readonly<Record<AdjustmentStatus, StatusBadgeGroup>> = {
  pending_approval: 'pending',
  approved: 'success',
  rejected: 'critical',
}

export function adjustmentStatusBadgeGroup(status: AdjustmentStatus): StatusBadgeGroup {
  return ADJUSTMENT_STATUS_GROUP[status]
}

/** ป้ายสถานะรอบบัญชีของรายการต้นทาง — `null` = ยังไม่มีงวดของเดือนนั้น (ถือเป็น collecting) */
export function periodStatusLabel(status: AccountingPeriodStatus | null): string {
  return status === null ? 'ยังไม่เปิดงวด' : periodLockPolicyFor(status).statusLabel
}

export function periodStatusBadgeGroup(status: AccountingPeriodStatus | null): StatusBadgeGroup {
  if (status === null) return 'neutral'
  if (status === 'locked') return 'critical'
  return status === 'sent_to_accountant' ? 'sent' : 'pending'
}

/** สีของยอดปรับ (mockup: เพิ่มยอด = เขียว · ลดยอด = แดง) */
export const ADJUSTMENT_TYPE_TONE: Readonly<Record<AdjustmentType, string>> = {
  increase: 'text-emerald-700',
  decrease: 'text-red-600',
}

/** เครื่องหมายหน้ายอดบนตาราง — ยอดในฐานข้อมูลเป็นบวกเสมอ (`20` §7.1) */
export function adjustmentSignPrefix(type: AdjustmentType): string {
  return type === 'increase' ? '+' : '−'
}

// ── ปุ่มบนแถว (`23` §6.9 — ชุดเดียวกับ API) ──────────────────────────────────

/** อนุมัติ/ปฏิเสธได้เฉพาะรายการที่ยัง `pending_approval` */
export function canActOnAdjustment(status: AdjustmentStatus): boolean {
  return canTransitionAdjustment(status, 'approved') || canTransitionAdjustment(status, 'rejected')
}

// ── ตัวกรอง (ค่าตรงกับ query schema ของ API) ────────────────────────────────

export type AdjustmentStatusFilter = 'all' | AdjustmentStatus
export type AdjustmentTargetFilter = 'all' | AdjustmentTargetType

export const ADJUSTMENT_STATUS_FILTERS: readonly { value: AdjustmentStatusFilter; label: string }[] = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'pending_approval', label: ADJUSTMENT_STATUS_LABEL.pending_approval },
  { value: 'approved', label: ADJUSTMENT_STATUS_LABEL.approved },
  { value: 'rejected', label: ADJUSTMENT_STATUS_LABEL.rejected },
]

export const ADJUSTMENT_TARGET_FILTERS: readonly { value: AdjustmentTargetFilter; label: string }[] = [
  { value: 'all', label: 'ทุกประเภท' },
  { value: 'revenue', label: ADJUSTMENT_TARGET_LABEL.revenue },
  { value: 'expense', label: ADJUSTMENT_TARGET_LABEL.expense },
  { value: 'billing_batch', label: ADJUSTMENT_TARGET_LABEL.billing_batch },
  { value: 'payout_batch', label: ADJUSTMENT_TARGET_LABEL.payout_batch },
]
