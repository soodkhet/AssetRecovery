import type { BillingBatchStatus, RevenueStatus, VatMode } from '@/lib/generated/prisma/enums'
import { canTransitionBillingBatch } from '@/lib/revenue/revenue'
import type { BillingBatchDto } from '@/lib/revenue/types'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ป้าย/สี/สิทธิ์ปุ่มของแท็บ "รายได้และวางบิล" (`19` §8 · mockup `finance.html` แท็บ `revenue`)
 * — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ⚠️ หน้าจอ **ห้าม if สถานะเอง** — ปุ่มถาม `canSendBillingBatch()`/`canDeleteBillingBatch()`
 *    ซึ่งอ่านตาราง transition ชุดเดียวกับ API (`23` §6.8)
 * ⚠️ ยอดทุกช่องมาจาก API (`outstandingSatang`/`daysOverdue` คิดที่ backend ด้วย `22` §6.11)
 *    — ที่นี่ไม่คิดสูตรเงินใด ๆ (Rule 01)
 */

export const BILLING_STATUS_LABEL: Readonly<Record<BillingBatchStatus, string>> = {
  draft: 'ร่าง',
  sent: 'ส่งบิลแล้ว',
  partially_paid: 'รับชำระบางส่วน',
  paid: 'รับชำระครบ',
}

/** สีจาก 10 กลุ่มของ `04` §8.1 เท่านั้น */
const BILLING_STATUS_GROUP: Readonly<Record<BillingBatchStatus, StatusBadgeGroup>> = {
  draft: 'neutral',
  sent: 'sent',
  partially_paid: 'partial',
  paid: 'success',
}

export function billingStatusBadgeGroup(status: BillingBatchStatus): StatusBadgeGroup {
  return BILLING_STATUS_GROUP[status]
}

export const REVENUE_STATUS_LABEL: Readonly<Record<RevenueStatus, string>> = {
  ready_for_billing: 'รอวางบิล',
  billed: 'รวมเข้ารอบแล้ว',
}

const REVENUE_STATUS_GROUP: Readonly<Record<RevenueStatus, StatusBadgeGroup>> = {
  ready_for_billing: 'pending',
  billed: 'sent',
}

export function revenueStatusBadgeGroup(status: RevenueStatus): StatusBadgeGroup {
  return REVENUE_STATUS_GROUP[status]
}

/** คอลัมน์ "VAT Flag" ของ `19` §8 — โหมดของบริษัทไฟแนนซ์ (`02` §5 `vat_mode`) */
export const VAT_MODE_LABEL: Readonly<Record<VatMode, string>> = {
  include_vat: 'Include VAT',
  exclude_vat: 'Exclude VAT',
  no_vat: 'ไม่มี VAT',
}

// ── ปุ่มบนแถว (`23` §6.8 — ชุดเดียวกับ API) ─────────────────────────────────

/** ส่งบิลจริงได้เฉพาะรอบ `draft` (`19` §9.1) */
export function canSendBillingBatch(status: BillingBatchStatus): boolean {
  return canTransitionBillingBatch(status, 'sent')
}

/** `19` §10 — "ห้ามลบ Billing Batch ที่ `status != draft`" */
export function canDeleteBillingBatch(status: BillingBatchStatus): boolean {
  return status === 'draft'
}

// ── AR (`19` §8 — "AR คงค้างแสดงเป็นสีแดงเด่นเมื่อ > 0") ────────────────────

/**
 * แถว/ตัวเลขต้องเป็นสีแดงหรือไม่ — ยอดค้าง `> 0` เท่านั้น (ยอดมาจาก API ห้ามคำนวณบนหน้าจอ)
 * รอบที่ยัง `draft` ยังไม่ได้ส่งให้ลูกค้า ⇒ ยังไม่ใช่ลูกหนี้ (สอดคล้องกับ `getArAging()`)
 */
export function isArOutstanding(batch: Pick<BillingBatchDto, 'outstandingSatang' | 'status'>): boolean {
  return batch.outstandingSatang > 0 && batch.status !== 'draft'
}

/** เกินกำหนดชำระแล้วหรือยัง — `daysOverdue` มาจาก API (นับตามปฏิทินไทย · `22` §6.11) */
export function isArOverdue(batch: Pick<BillingBatchDto, 'outstandingSatang' | 'status' | 'daysOverdue'>): boolean {
  return isArOutstanding(batch) && batch.daysOverdue > 0
}

/** ยอดค้างรับรวมของรายการที่แสดงอยู่ (`19` §8 หัวตาราง) — บวกเฉพาะรอบที่เป็นลูกหนี้จริง */
export function totalArOutstandingSatang(
  batches: readonly Pick<BillingBatchDto, 'outstandingSatang' | 'status'>[],
): number {
  return batches.filter(isArOutstanding).reduce((sum, batch) => sum + batch.outstandingSatang, 0)
}

// ── ตัวกรอง (ค่าตรงกับ query schema ของ API) ────────────────────────────────

export type BillingStatusFilter = 'all' | BillingBatchStatus
export type RevenueStatusFilter = 'all' | RevenueStatus

export const BILLING_STATUS_FILTERS: readonly { value: BillingStatusFilter; label: string }[] = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'draft', label: BILLING_STATUS_LABEL.draft },
  { value: 'sent', label: BILLING_STATUS_LABEL.sent },
  { value: 'partially_paid', label: BILLING_STATUS_LABEL.partially_paid },
  { value: 'paid', label: BILLING_STATUS_LABEL.paid },
]

export const REVENUE_STATUS_FILTERS: readonly { value: RevenueStatusFilter; label: string }[] = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'ready_for_billing', label: REVENUE_STATUS_LABEL.ready_for_billing },
  { value: 'billed', label: REVENUE_STATUS_LABEL.billed },
]
