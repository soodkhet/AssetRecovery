import type {
  AssignmentStatus,
  BillingBatchStatus,
  CaseStatus,
  HandoverLotStatus,
  TaxInvoiceStatus,
} from '@/lib/generated/prisma/enums'
import { BILLING_STATUS_LABEL, billingStatusBadgeGroup } from '@/lib/revenue/revenue-ui'
import { TAX_INVOICE_STATUS_LABEL } from '@/lib/sales/sales'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * สถานะที่ **ฝั่งบริษัทไฟแนนซ์เห็น** ในพอร์ทัล (`97` §10 · มติ PO 05/10/2569 U6/O43)
 *
 * - เป็น label mapping ล้วน ไม่ใช่ state machine ใหม่ (`97` §10.1) — ประมวลผลที่ backend เท่านั้น
 *   ห้ามส่ง raw enum ของเคส/งานภาคสนาม/ล็อตออกไป (`97` §11, §19)
 * - `code` ของเคส/ล็อตตั้งชื่อ **ไม่ซ้ำ** กับ enum ภายใน (`02` §3) โดยเจตนา เพื่อให้ตรวจได้ว่าไม่มี raw enum หลุด
 * - billing/ใบกำกับใช้คำเดิมได้ตรง ๆ (`97` §10.3) — `code` จึงเท่ากับ enum
 * - สีมาจาก 10 กลุ่มของ mapper กลาง (`lib/ui/status-badge.ts` · `04` §8.1) เท่านั้น
 */
export interface PortalStatusDisplay<Code extends string = string> {
  code: Code
  label: string
  tone: StatusBadgeGroup
  /** ป้ายแบบเส้นขอบ (`97` §10.1 "slate (outline)" ของเคสไม่สำเร็จ) */
  outline: boolean
}

/** ทำให้ switch ครบทุก enum — enum ใหม่ที่ยังไม่ map จะ compile ไม่ผ่าน และ throw ตอน runtime */
export function assertNever(value: never, kind: string): never {
  throw new Error(`portal status-map: unknown ${kind} "${String(value)}"`)
}

// ── เคส (`97` §10.1) ─────────────────────────────────────────────────────────

export const PORTAL_CASE_STATUS_CODES = [
  'under_review',
  'info_requested',
  'declined',
  'tracking',
  'recovered',
  'not_recovered',
] as const
export type PortalCaseStatusCode = (typeof PORTAL_CASE_STATUS_CODES)[number]

const CASE_DISPLAY: Readonly<Record<PortalCaseStatusCode, PortalStatusDisplay<PortalCaseStatusCode>>> = {
  under_review: { code: 'under_review', label: 'อยู่ระหว่างตรวจสอบ', tone: 'neutral', outline: false },
  info_requested: { code: 'info_requested', label: 'ขอข้อมูลเพิ่มเติม', tone: 'cleared', outline: false },
  declined: { code: 'declined', label: 'ไม่รับเคส', tone: 'critical', outline: false },
  tracking: { code: 'tracking', label: 'กำลังดำเนินการติดตาม', tone: 'pending', outline: false },
  recovered: { code: 'recovered', label: 'ติดตามสำเร็จ', tone: 'success', outline: false },
  not_recovered: { code: 'not_recovered', label: 'ติดตามไม่สำเร็จ', tone: 'neutral', outline: true },
}

export function portalCaseStatusDisplayOf(code: PortalCaseStatusCode): PortalStatusDisplay<PortalCaseStatusCode> {
  return CASE_DISPLAY[code]
}

export interface CaseStatusInput {
  status: CaseStatus
  /**
   * สถานะงานภาคสนามของ assignment ปัจจุบัน (ไม่นับ `reassigned_away`) — `null` = ยังไม่มีงาน
   * ใช้จับเคส "ถูกตีกลับ" (`needs_revision`): `cases.status` ยังเป็น `closed_*` แต่บริษัทต้องเห็น
   * "กำลังดำเนินการติดตาม" (`97` §10.1 "terminal, ไม่ถูกตีกลับ")
   */
  assignmentStatus?: AssignmentStatus | null
}

/** งานภาคสนามยังไม่ terminal หรือถูกตีกลับ ⇒ ยังติดตามอยู่ */
function isAssignmentOpen(status: AssignmentStatus): boolean {
  switch (status) {
    case 'pending_accept':
    case 'accepted_unscheduled':
    case 'scheduled':
    case 'needs_revision':
      return true
    case 'closed_success':
    case 'closed_fail':
    case 'reassigned_away':
      return false
    default:
      return assertNever(status, 'assignment_status')
  }
}

/** enum ภายในของเคส (+ งานภาคสนาม) → รหัสสถานะฝั่งบริษัท (`97` §10.1) */
export function portalCaseStatusCode(input: CaseStatusInput): PortalCaseStatusCode {
  const assignment = input.assignmentStatus ?? null
  switch (input.status) {
    case 'draft':
    case 'pending_review':
      return 'under_review'
    case 'need_info':
      return 'info_requested'
    case 'rejected':
      return 'declined'
    case 'approved':
    case 'active':
    case 'pending_recycle_review':
      return 'tracking'
    case 'closed_success':
      return assignment !== null && isAssignmentOpen(assignment) ? 'tracking' : 'recovered'
    case 'closed_fail':
      return assignment !== null && isAssignmentOpen(assignment) ? 'tracking' : 'not_recovered'
    default:
      return assertNever(input.status, 'case_status')
  }
}

export function portalCaseStatusDisplay(input: CaseStatusInput): PortalStatusDisplay<PortalCaseStatusCode> {
  return CASE_DISPLAY[portalCaseStatusCode(input)]
}

/** เหตุผลแสดงเฉพาะ "ไม่รับเคส"/"ขอข้อมูลเพิ่มเติม" (`97` §6.1 `status_reason`) */
export function portalCaseShowsReason(code: PortalCaseStatusCode): boolean {
  return code === 'declined' || code === 'info_requested'
}

// ── ล็อตส่งมอบ (`97` §10.2) ──────────────────────────────────────────────────

export const PORTAL_LOT_STATUS_CODES = ['awaiting_dispatch', 'dispatched', 'delivered'] as const
export type PortalLotStatusCode = (typeof PORTAL_LOT_STATUS_CODES)[number]

const LOT_DISPLAY: Readonly<Record<PortalLotStatusCode, PortalStatusDisplay<PortalLotStatusCode>>> = {
  awaiting_dispatch: { code: 'awaiting_dispatch', label: 'รอดำเนินการส่งมอบ', tone: 'pending', outline: false },
  dispatched: { code: 'dispatched', label: 'จัดส่งแล้ว รอยืนยัน', tone: 'sent', outline: false },
  delivered: { code: 'delivered', label: 'ส่งมอบสำเร็จ', tone: 'success', outline: false },
}

export function portalLotStatusDisplay(status: HandoverLotStatus): PortalStatusDisplay<PortalLotStatusCode> {
  switch (status) {
    case 'pending_attach':
      return LOT_DISPLAY.awaiting_dispatch
    case 'pending_delivery_proof':
      return LOT_DISPLAY.dispatched
    case 'confirmed':
      return LOT_DISPLAY.delivered
    default:
      return assertNever(status, 'handover_lot_status')
  }
}

/** ดาวน์โหลดเอกสารล็อตได้เฉพาะ `confirmed` (`97` §6.4 · D8) */
export function portalLotDownloadable(status: HandoverLotStatus): boolean {
  return status === 'confirmed'
}

// ── รอบวางบิล / ใบกำกับภาษี (`97` §10.3) ───────────────────────────────────

export type PortalBillingStatusCode = Exclude<BillingBatchStatus, 'draft'>

/** `draft` ไม่แสดงในพอร์ทัลเด็ดขาด (`97` §6.2) ⇒ คืน `null` ให้ผู้เรียกกรองทิ้ง */
export function portalBillingStatusDisplay(
  status: BillingBatchStatus,
): PortalStatusDisplay<PortalBillingStatusCode> | null {
  switch (status) {
    case 'draft':
      return null
    case 'sent':
    case 'partially_paid':
    case 'paid':
      return { code: status, label: BILLING_STATUS_LABEL[status], tone: billingStatusBadgeGroup(status), outline: false }
    default:
      return assertNever(status, 'billing_batch_status')
  }
}

export function portalTaxInvoiceStatusDisplay(status: TaxInvoiceStatus): PortalStatusDisplay<TaxInvoiceStatus> {
  switch (status) {
    case 'active':
      return { code: 'active', label: TAX_INVOICE_STATUS_LABEL.active, tone: 'success', outline: false }
    case 'cancelled':
      return { code: 'cancelled', label: TAX_INVOICE_STATUS_LABEL.cancelled, tone: 'critical', outline: false }
    default:
      return assertNever(status, 'tax_invoice_status')
  }
}
