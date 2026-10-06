import { ModuleError } from '@/lib/api/errors'
import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'
import { canExpenseAction } from '@/lib/field/expense-status'
import { resetApprovalToFirstStep } from '@/lib/finance/approval-flow-resolver'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'
import { approvalRoleColumn, type ApproverColumn } from '@/lib/settings/approval-matrix'
import { SettingsError } from '@/lib/settings/errors'

/**
 * สายอนุมัติค่าตอบแทนหลายขั้น — **pure ล้วน ใช้ร่วม FE/BE** (ไฟล์ 16 · `23` §6.5 · `13` §6.2)
 *
 * แบ่งหน้าที่กับของที่มีอยู่แล้ว **ห้ามเขียนซ้ำ**:
 * - เลือกสาย/เดินขั้น/ยามข้ามขั้น/ยาม SoD → `lib/finance/approval-flow-resolver.ts` (Phase 3.1)
 * - สถานะที่ทำ action ได้ → `lib/field/expense-status.ts` (Phase 2.9)
 * - ไฟล์นี้ = **ตัวเชื่อม**: ขั้น ↔ สถานะ ↔ capability ↔ `approval_history`
 *
 * ### ขั้น ↔ สถานะ (`23` §6.3 + §6.5)
 * enum `expense_status` มีสถานะ "รออนุมัติ" แค่ 2 ตัว แต่สายอนุมัติยาวได้ถึง 5 ขั้น (`13` §6.2)
 * ⇒ สถานะเป็นฟังก์ชันของ **ขั้นที่กำลังรอ** ไม่ใช่ของจำนวนขั้นทั้งหมด:
 * รอขั้น 1 = `pending_approval` · รอขั้น ≥ 2 = `pending_finance_approval` · ไม่เหลือขั้น = `approved`
 * (สายขั้นเดียวจึงไปจาก `pending_approval` → `approved` ได้ตรง ๆ ตาม `16` §9)
 */

export type ApprovalHistoryAction = 'approve' | 'reject'

/** `16` §7 — `{step, approver_id, action, timestamp, reason}` (เก็บเป็น JSON บน `expenses`) */
export interface ApprovalHistoryEntry {
  step: number
  approverId: string
  /** role ของผู้กระทำ ณ ตอนนั้น — เก็บไว้เพราะ role ของ user เปลี่ยนภายหลังได้ */
  approverRole: string
  action: ApprovalHistoryAction
  /** ISO 8601 UTC (Rule 01 — แปลงเป็น พ.ศ./Asia-Bangkok ที่ display layer เท่านั้น) */
  timestamp: string
  reason: string | null
}

/** อ่าน JSON ที่เก็บไว้แบบไม่ไว้ใจรูปร่าง — แถวที่พังถูกข้าม ไม่ทำให้ทั้ง endpoint ล้ม */
export function parseApprovalHistory(value: unknown): ApprovalHistoryEntry[] {
  if (!Array.isArray(value)) return []
  const entries: ApprovalHistoryEntry[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as Record<string, unknown>
    if (typeof row.step !== 'number' || typeof row.approverId !== 'string') continue
    if (row.action !== 'approve' && row.action !== 'reject') continue
    entries.push({
      step: row.step,
      approverId: row.approverId,
      approverRole: typeof row.approverRole === 'string' ? row.approverRole : '',
      action: row.action,
      timestamp: typeof row.timestamp === 'string' ? row.timestamp : '',
      reason: typeof row.reason === 'string' ? row.reason : null,
    })
  }
  return entries
}

/** `16` §13 — ประวัติเป็น **append-only** (แก้/ลบของเดิมไม่ได้ เหมือน audit log) */
export function appendApprovalHistory(
  history: readonly ApprovalHistoryEntry[],
  entry: ApprovalHistoryEntry,
): ApprovalHistoryEntry[] {
  return [...history, entry]
}

/**
 * ผู้ที่ **อนุมัติ** ไปแล้วในรอบปัจจุบัน — ใช้เป็น input ของ `assertNoDuplicateApprover()` (`16` §10)
 *
 * นับเฉพาะหลังการตีกลับครั้งล่าสุด เพราะตีกลับ = เริ่มขั้น 1 ใหม่ทั้งหมด (`16` §9)
 * ⇒ คนที่เคยอนุมัติในรอบก่อนตีกลับ อนุมัติรอบใหม่ได้
 */
export function approversInCurrentRound(history: readonly ApprovalHistoryEntry[]): string[] {
  const lastReject = history.map((entry) => entry.action).lastIndexOf('reject')
  return history
    .slice(lastReject + 1)
    .filter((entry) => entry.action === 'approve')
    .map((entry) => entry.approverId)
}

/** `23` §6.3 + §6.5 — สถานะตามขั้นที่กำลังรอ (`null` = ผ่านครบทุกขั้นแล้ว) */
export function expenseStatusForPendingStep(pendingStep: number | null): ExpenseStatus {
  if (pendingStep === null) return 'approved'
  if (!Number.isInteger(pendingStep) || pendingStep < 1) {
    throw new RangeError(`ขั้นที่รออนุมัติต้องเป็นจำนวนเต็มตั้งแต่ 1 (ได้ ${pendingStep})`)
  }
  return pendingStep === 1 ? 'pending_approval' : 'pending_finance_approval'
}

export type { ApproverColumn }

interface ApprovalRoleContract {
  capability: string
  column: ApproverColumn
}

/**
 * role ในสายอนุมัติ (`approval_matrices.approval_flow` — ข้อความอิสระที่ตั้งได้เองใน `13` §6.2)
 * → capability ที่ต้องถือจริง + คอลัมน์ผู้อนุมัติ
 *
 * รับทั้งชื่อ role ตาม seed (`07` §5) และชื่ออังกฤษที่ `13` §6.2 ยกเป็นตัวอย่าง (`[Manager, FinanceAdmin]`)
 * — ชื่อนอกรายการนี้ = **ตั้งค่าสายผิด** ไม่ใช่ "ใครก็อนุมัติได้" จึงต้องปฏิเสธ
 */
const COLUMN_CAPABILITY: Readonly<Record<ApproverColumn, string>> = {
  manager: 'approve_expense_manager',
  finance: 'approve_expense_finance',
  executive: 'approve_expense_executive',
}

/**
 * capability ทั้งหมดที่ "เป็นผู้อนุมัติสักขั้น" ถืออยู่ — ใช้เป็นด่านแรกที่ API layer
 * (`requireAnyPermission()`) ก่อนที่ชั้นข้อมูลจะตรวจ capability **ของขั้นนั้นจริง ๆ** ซ้ำอีกที
 */
export const APPROVAL_STEP_CAPABILITIES: readonly string[] = [
  'approve_expense_manager',
  'approve_expense_finance',
  'approve_expense_executive',
]

export function approvalRoleContract(roleName: string): ApprovalRoleContract {
  // ตัวจับคู่ชื่อ → คอลัมน์อยู่ `lib/settings/approval-matrix.ts` ที่เดียว (ตัวตั้งค่าใช้ตัวเดียวกัน — UAT BUG-008)
  const column = approvalRoleColumn(roleName)
  if (column !== null) return { capability: COLUMN_CAPABILITY[column], column }
  throw new SettingsError('APPROVAL_MATRIX_NOT_FOUND', {
    detail: `สายอนุมัติอ้างบทบาท "${roleName}" ที่ไม่มี capability รองรับ`,
    context: { role: roleName },
  })
}

/** ผู้ถือสิทธิ์เท่าที่ตัวตรวจต้องรู้ — รับ `SessionUser` ได้ตรง ๆ โดยไม่ผูกกับ session จริง */
export interface ApprovalActor extends CapabilityHolder {
  id: string
}

export class ApprovalPermissionError extends ModuleError<'PERMISSION_DENIED'> {
  constructor(detail: string) {
    super(
      'PERMISSION_DENIED',
      {
        title: 'ไม่มีสิทธิ์อนุมัติขั้นนี้',
        message: 'ขั้นอนุมัตินี้เป็นของบทบาทอื่น — รอผู้มีสิทธิ์ตามสายอนุมัติดำเนินการ',
      },
      403,
      { detail },
    )
  }
}

/**
 * `16` §10/§12 — ผู้อนุมัติต้องถือ capability **ของขั้นนั้นโดยเฉพาะ**
 * (ถือ `approve_expense_finance` ไม่ได้แปลว่าอนุมัติขั้น Executive แทนได้)
 */
export function assertActorCanApproveStep(actor: ApprovalActor, stepRole: string): ApprovalRoleContract {
  const contract = approvalRoleContract(stepRole)
  if (!hasCapability(actor, 'manage', contract.capability)) {
    throw new ApprovalPermissionError(`step_role=${stepRole} capability=${contract.capability} actor=${actor.id}`)
  }
  return contract
}

/** ถือ capability ของ role ที่ขั้นนี้รออยู่ไหม — role ที่ไม่รู้จัก = ไม่ถือ (ไม่ throw: ใช้กรองการมองเห็น) */
function holdsStepCapability(actor: CapabilityHolder, stepRole: string | undefined, action: 'view' | 'manage'): boolean {
  if (stepRole === undefined) return false
  const column = approvalRoleColumn(stepRole)
  return column !== null && hasCapability(actor, action, COLUMN_CAPABILITY[column])
}

/** สถานะที่ "รอผู้อนุมัติสักขั้น" อยู่จริง (`23` §6.3) — สถานะอื่นไม่ได้รอใครในสายอนุมัติ */
const AWAITING_APPROVER: readonly ExpenseStatus[] = ['pending_approval', 'pending_finance_approval']

export interface ApprovalVisibilityInput {
  status: ExpenseStatus
  approvalStepCurrent: number
  /** role ของแต่ละขั้นตามสาย (snapshot หรือคาดการณ์) — ลำดับมีความหมาย */
  steps: readonly string[]
}

/**
 * `16` §10 — "ผู้อนุมัติขั้นที่ N เห็นได้แค่รายการที่ผ่านขั้น 1 ถึง N-1 มาแล้วเท่านั้น" (UAT R6-7)
 *
 * - รายการที่ **รออนุมัติ** เห็นได้เมื่อผู้ใช้ถือ capability ของขั้นใดขั้นหนึ่งตั้งแต่ขั้น 1 ถึงขั้นที่
 *   รายการค้างอยู่ — เช่น การเงิน (ขั้น 2) ไม่เห็นรายการที่ยังรอผู้จัดการ (ขั้น 1)
 * - รายการที่ไม่ได้รอใคร (อนุมัติแล้ว / ถูกตีกลับรอผู้เบิกแก้) ผู้อนุมัติใน scope เห็นได้ (ประวัติ)
 * - Superadmin เห็นทั้งหมดโดยนิยาม (DEC-009)
 *
 * ⚠️ เป็นการกรอง **การมองเห็นในคิว** — สิทธิ์กดจริงยังตรวจซ้ำที่ `assertActorCanApproveStep()` เสมอ
 */
export function isApprovalItemVisibleTo(actor: CapabilityHolder, item: ApprovalVisibilityInput): boolean {
  if (actor.isSuperadmin) return true
  if (!AWAITING_APPROVER.includes(item.status)) return true
  const reached = Math.min(item.approvalStepCurrent, item.steps.length)
  for (let step = 1; step <= reached; step += 1) {
    if (holdsStepCapability(actor, item.steps[step - 1], 'view')) return true
  }
  return false
}

/**
 * ผู้ใช้กด "อนุมัติ/ตีกลับ" รายการนี้ได้ไหม — ถือ capability ระดับ `manage` ของ **ขั้นที่รายการรออยู่**
 * (หน้าจอใช้ซ่อนปุ่มรายแถว แทนการโชว์ปุ่มที่กดแล้วได้ 403 — UAT R6-7) · API ตรวจซ้ำเสมอ (DEC-002)
 */
export function canActOnApprovalStep(actor: CapabilityHolder, item: ApprovalVisibilityInput): boolean {
  if (!AWAITING_APPROVER.includes(item.status)) return false
  if (actor.isSuperadmin) return true
  return holdsStepCapability(actor, item.steps[item.approvalStepCurrent - 1], 'manage')
}

/**
 * ขั้นที่ "เป็นเจ้าของ" การปฏิเสธถาวร (มติ PO U118) — `needs_revision` = ขั้นที่ตีกลับรายการนี้ครั้งล่าสุด
 * (ประวัติ `reject` ล่าสุด · ไม่มีประวัติ = ขั้นปัจจุบัน) · สถานะอื่น = ขั้นที่รายการรออยู่
 */
export function permanentRejectStep(item: {
  status: ExpenseStatus
  approvalStepCurrent: number
  history: readonly ApprovalHistoryEntry[]
}): number {
  if (item.status !== 'needs_revision') return item.approvalStepCurrent
  const lastReject = [...item.history].reverse().find((entry) => entry.action === 'reject')
  return lastReject?.step ?? item.approvalStepCurrent
}

/** ผู้ใช้ปฏิเสธถาวรรายการนี้ได้ไหม (UX — API ตรวจซ้ำด้วย `assertActorCanApproveStep()` ขั้นเดียวกัน) */
export function canPermanentlyRejectStep(
  actor: CapabilityHolder,
  item: ApprovalVisibilityInput & { history: readonly ApprovalHistoryEntry[] },
): boolean {
  if (!canExpenseAction(item.status, 'reject_permanent')) return false
  if (actor.isSuperadmin) return true
  return holdsStepCapability(actor, item.steps[permanentRejectStep(item) - 1], 'manage')
}

/** คอลัมน์ผู้อนุมัติที่ต้องเขียนเมื่อผ่านขั้นนี้ (คอลัมน์ที่ไม่ตรงขั้นไม่ถูกแตะ) */
export function approverStampFor(column: ApproverColumn, actorId: string, at: Date) {
  if (column === 'manager') return { managerApprovedBy: actorId, managerApprovedAt: at }
  if (column === 'finance') return { financeApprovedBy: actorId, financeApprovedAt: at }
  return { executiveApprovedBy: actorId, executiveApprovedAt: at }
}

/** ตีกลับ = ล้างรอยประทับของทุกขั้น เพราะรอบใหม่ต้องผ่านทุกขั้นใหม่ทั้งหมด (`16` §9) */
export const CLEARED_APPROVER_STAMPS = {
  managerApprovedBy: null,
  managerApprovedAt: null,
  financeApprovedBy: null,
  financeApprovedAt: null,
  executiveApprovedBy: null,
  executiveApprovedAt: null,
} as const

/**
 * ชุดค่าที่ต้องเขียนลง `expenses` เมื่อ **ตีกลับ** (`16` §9 · `41` §8 `reject_expense`)
 * — **บ้านเดียวของกฎ "ตีกลับแล้วกลับขั้น 1 เสมอ"** ใช้ร่วมทั้ง `/api/compensation/:id/reject`
 * และ `/api/field/expenses/:id/reject` (Phase 2.9) ห้ามประกอบเองซ้ำที่ service
 *
 * ผู้เรียกต้องผ่าน `assertRejectReason()` + `nextExpenseStatus(status, 'reject_expense')` มาก่อน
 */
export function buildRejectExpenseUpdate(input: {
  status: ExpenseStatus
  history: readonly ApprovalHistoryEntry[]
  rejectedStep: number
  actorId: string
  actorRole: string
  reason: string
  at: Date
}): {
  status: ExpenseStatus
  rejectionReason: string
  approvalStepCurrent: number
  /** ผู้เรียกฝั่ง DB เป็นคนแปลงเป็น JSON ของ Prisma (ไฟล์นี้ pure — ไม่รู้จัก Prisma) */
  approvalHistory: ApprovalHistoryEntry[]
  managerApprovedBy: null
  managerApprovedAt: null
  financeApprovedBy: null
  financeApprovedAt: null
  executiveApprovedBy: null
  executiveApprovedAt: null
} {
  return {
    status: input.status,
    rejectionReason: input.reason,
    approvalStepCurrent: resetApprovalToFirstStep(),
    approvalHistory: appendApprovalHistory(input.history, {
      step: input.rejectedStep,
      approverId: input.actorId,
      approverRole: input.actorRole,
      action: 'reject',
      timestamp: input.at.toISOString(),
      reason: input.reason,
    }),
    ...CLEARED_APPROVER_STAMPS,
  }
}
