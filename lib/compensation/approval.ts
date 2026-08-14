import { ModuleError } from '@/lib/api/errors'
import {
  EXECUTIVE_ROLE_NAME,
  FINANCE_ROLE_NAME,
  TEAM_MANAGER_ROLE_NAME,
} from '@/lib/auth/constants'
import { hasCapability, type CapabilityHolder } from '@/lib/auth/permission'
import { resetApprovalToFirstStep } from '@/lib/finance/approval-flow-resolver'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'
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

/** คอลัมน์ผู้อนุมัติบน `expenses` ที่ขั้นนั้นต้องประทับ (`02` §8 · `16` §7 DEC-006/D5) */
export type ApproverColumn = 'manager' | 'finance' | 'executive'

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
export const APPROVAL_ROLE_CONTRACTS: Readonly<Record<string, ApprovalRoleContract>> = {
  [TEAM_MANAGER_ROLE_NAME]: { capability: 'approve_expense_manager', column: 'manager' },
  [FINANCE_ROLE_NAME]: { capability: 'approve_expense_finance', column: 'finance' },
  [EXECUTIVE_ROLE_NAME]: { capability: 'approve_expense_executive', column: 'executive' },
  manager: { capability: 'approve_expense_manager', column: 'manager' },
  finance: { capability: 'approve_expense_finance', column: 'finance' },
  financeadmin: { capability: 'approve_expense_finance', column: 'finance' },
  executive: { capability: 'approve_expense_executive', column: 'executive' },
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
  const exact = APPROVAL_ROLE_CONTRACTS[roleName.trim()]
  if (exact !== undefined) return exact
  const folded = APPROVAL_ROLE_CONTRACTS[roleName.trim().toLowerCase().replace(/\s+/g, '')]
  if (folded !== undefined) return folded
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
