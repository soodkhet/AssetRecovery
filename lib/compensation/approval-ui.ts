import type { ApiCallError } from '@/lib/api/types'
import type { ApprovalHistoryEntry } from '@/lib/compensation/approval'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import { isManualClaim } from '@/lib/claims/claim'
import { canExpenseAction } from '@/lib/field/expense-status'
import type { ExpenseStatus, ExpenseType } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ข้อความ/ปุ่มของหน้าจออนุมัติรายการเบิก (`15` §8 · `16` §8) — **pure ล้วน**
 *
 * ⚠️ หน้าจอ **ห้าม if สถานะเอง** — ปุ่มมาจาก `expenseRowActions()` ซึ่งอ่านจาก state machine
 * ตัวเดียวกับ API (`lib/field/expense-status.ts` — `23` §6.3) · ป้ายสถานะ/ประเภทใช้ชุดเดิมของ
 * `lib/field/expense-ui.ts` (2.12) **ห้ามประกาศซ้ำ**
 */

/** ชนิดรายการเบิกที่ปฏิเสธถาวรได้ (มติ PO 06/10/2569 U117 ข้อ 3 — ใบเบิกค่าที่พัก) · ใช้ทั้งปุ่มและ API */
export const PERMANENT_REJECT_EXPENSE_TYPE_SET: ReadonlySet<ExpenseType> = new Set<ExpenseType>(['hotel'])

/** ปุ่มบนแถวของตารางรออนุมัติ (mockup `finance.html` แท็บ `approval`/`comp`) */
export type ExpenseRowAction = 'approve' | 'reject' | 'reject_permanent' | 'view_formula'

export interface ExpenseRowActionsInput {
  status: ExpenseStatus
  /** ผู้เรียกถือ capability ของสายอนุมัติสักขั้นไหม (UX เท่านั้น — API ตรวจขั้นที่รออยู่ซ้ำเสมอ) */
  canApprove: boolean
  /** ชนิดรายการ — ปุ่ม "ปฏิเสธ" (ถาวร) มีเฉพาะใบเบิกค่าที่พัก (มติ PO U117 ข้อ 3) · ไม่ระบุ = ไม่มีปุ่ม */
  expenseType?: ExpenseType
}

/**
 * `16` §8 — รายการที่ยังอยู่ในคิวอนุมัติเท่านั้นที่มีปุ่มอนุมัติ/ตีกลับ
 * ที่เหลือเห็นได้แค่ "ดูสูตร" · ไม่มีสิทธิ์อนุมัติ = ปุ่ม**หายไปเลย** ไม่ใช่ปุ่มเทา (Rule 05)
 */
export function expenseRowActions(input: ExpenseRowActionsInput): ExpenseRowAction[] {
  const inQueue =
    canExpenseAction(input.status, 'approve_manager') || canExpenseAction(input.status, 'approve_finance')
  if (!inQueue || !input.canApprove) return ['view_formula']
  const permanent =
    input.expenseType !== undefined &&
    PERMANENT_REJECT_EXPENSE_TYPE_SET.has(input.expenseType) &&
    canExpenseAction(input.status, 'reject_permanent')
  return permanent ? ['approve', 'reject', 'reject_permanent', 'view_formula'] : ['approve', 'reject', 'view_formula']
}

/**
 * ข้อความ stepper ในแถว (`16` §8 — "ขั้น 1/2: รอ การเงิน")
 * รายการที่จบแล้วบอกผลแทนเลขขั้น (ตรงกับ `approvalStepBadge()` ของ mockup)
 */
export function approvalStepText(item: CompensationApprovalDto): string {
  if (item.status === 'approved') return '✓ ผ่านทุกขั้น'
  if (item.status === 'rejected') return '✗ ปฏิเสธ'
  if (item.status === 'needs_revision') return '↩ ถูกตีกลับ — กลับไปขั้น 1'
  if (item.status === 'superseded') return 'ถูกแทนที่ด้วยรอบใหม่'
  if (item.status === 'pending_warehouse_confirm') return 'รอคลังยืนยันก่อนเข้าคิวอนุมัติ'
  const role = item.pendingStepRole === null ? 'ยังไม่ได้ตั้งสายอนุมัติ' : `รอ ${item.pendingStepRole}`
  return `ขั้น ${item.approvalStepCurrent}/${item.approvalStepTotal}: ${role}`
}

export function approvalStepTone(status: ExpenseStatus): StatusBadgeGroup {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'critical'
  if (status === 'needs_revision') return 'warning'
  if (status === 'superseded') return 'superseded'
  return 'neutral'
}

/** `15` §8 — ป้ายบอกที่มาของรายการ (auto จากไฟล์ 41 หรือบันทึกเอง) */
export function claimSourceLabel(calculationSource: string | null): string {
  return isManualClaim(calculationSource) ? '✏️ บันทึกเอง' : '🤖 อัตโนมัติ'
}

/** บรรทัดประวัติอนุมัติใน modal "ดูสูตร" (`16` §8) — เวลาแปลงเป็น พ.ศ. ที่ component */
export function approvalHistoryLabel(entry: ApprovalHistoryEntry, totalSteps: number): string {
  const mark = entry.action === 'approve' ? '✓' : '↩'
  return `${mark} ขั้น ${entry.step}/${totalSteps}: ${entry.approverRole || '—'}`
}

/** แถวที่ต้องเน้นพื้นหลัง (mockup: `needs_revision` = ส้มอ่อน) */
export function expenseRowHighlight(status: ExpenseStatus): string | null {
  return status === 'needs_revision' ? 'bg-orange-50/30' : null
}

/** ตัวกรองสถานะของแท็บรออนุมัติ (mockup 5 pill) — ค่าตรงกับ `compensationListQuerySchema` */
export const CLAIM_STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending_approval', label: 'รอขั้น 1 (ผู้จัดการ)' },
  { value: 'pending_finance_approval', label: 'รอขั้น 2 (การเงิน)' },
  { value: 'needs_revision', label: 'ถูกตีกลับ' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
] as const

export type ClaimStatusFilter = (typeof CLAIM_STATUS_FILTERS)[number]['value']

/** ยอดรวมที่รออนุมัติ (satang) — นับเฉพาะรายการที่ยังอยู่ในคิวจริง */
export function pendingClaimTotalSatang(items: readonly CompensationApprovalDto[]): number {
  return items
    .filter((item) => item.status === 'pending_approval' || item.status === 'pending_finance_approval')
    .reduce((sum, item) => sum + item.grossSatang, 0)
}

/**
 * ข้อความ toast เมื่ออนุมัติไม่ผ่าน — `APPROVAL_STEP_OUT_OF_ORDER` มีสองทิศ (BUG-105):
 * ขั้นที่ส่งมา **น้อยกว่า** ขั้นปัจจุบัน = หน้าค้าง รายการผ่านขั้นนี้ไปแล้ว (ไม่ใช่ "ยังไม่ถึงขั้น")
 * — ใช้ code เดิมจาก `24` §6.4 อ่านทิศจาก `requestedStep`/`currentStep` ที่ API แนบมา
 */
export function approvalErrorToast(error: ApiCallError): { title: string; message: string; stale: boolean } {
  const requested = error.payload?.requestedStep
  const current = error.payload?.currentStep
  if (
    error.code === 'APPROVAL_STEP_OUT_OF_ORDER' &&
    typeof requested === 'number' &&
    typeof current === 'number' &&
    requested < current
  ) {
    return {
      title: 'รายการนี้ผ่านขั้นของคุณแล้ว',
      message: 'รายการนี้ผ่านขั้นของคุณแล้ว — รีเฟรชหน้า',
      stale: true,
    }
  }
  return { title: error.title, message: error.message, stale: false }
}

/**
 * ป้ายช่องภาษีบนคิวอนุมัติ/ค่าตอบแทน (BUG-176) — เงื่อนไข (2)/(3) บริษัทออกภาษีให้ ⇒ ไม่ใช่ยอด "หัก" จากผู้รับ
 */
export function whtAmountLabel(item: { whtPayerBorne: boolean }): string {
  return item.whtPayerBorne ? 'ภาษีที่บริษัทออกให้' : 'WHT'
}

/** คำอธิบายใต้ยอดภาษีใน modal "ดูสูตร" (BUG-176) */
export function whtAmountHint(item: {
  whtPctUsed: number
  whtRateSource: 'payee' | 'plan'
  whtPayerBorne: boolean
  whtFromPayout: boolean
}, fmtPct: (pct: number) => string): string {
  const parts = [
    fmtPct(item.whtPctUsed),
    item.whtRateSource === 'payee' ? 'จาก Tax Profile ของผู้รับเงิน' : 'ตกไปใช้อัตราของแผน',
  ]
  if (item.whtPayerBorne) parts.push('บริษัทออกให้ ไม่หักจากผู้รับ')
  parts.push(item.whtFromPayout ? 'ยอดตามรอบจ่ายที่บันทึกแล้ว' : 'ยอดคาดการณ์ — ยอดจริงคิดตอนสร้างรอบจ่าย')
  return parts.join(' · ')
}
