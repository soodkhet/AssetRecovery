import { ModuleError } from '@/lib/api/errors'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'

/**
 * State machine ของรายการเบิก (`23` §6.3 — entity เดียวกับไฟล์ 15 · enum เดียวกับ `02` §3)
 * **pure ล้วน** ใช้ร่วม FE/BE — ห้าม if สถานะเองในหน้าจอ/route
 *
 * ```
 * pending_warehouse_confirm → pending_approval            (คลังยืนยัน — ไฟล์ 44 §11)
 * pending_approval → pending_finance_approval → approved  (ไฟล์ 16)
 * pending_approval | pending_finance_approval → needs_revision  (reject_expense + reason)
 * needs_revision → pending_approval                       (resubmit_expense — ไม่ผ่านคลังซ้ำ)
 * pending_approval → rejected                             (terminal)
 * (ทุกสถานะที่ยังไม่เข้ารอบจ่าย) → superseded              (resubmit_close_case — `41` §10.1)
 * ```
 *
 * ⚠️ **2 เส้นทางตีกลับห้ามสลับกัน** (`41` §10.1): `reject_expense` แตะแค่ `expense.status`
 * ส่วน `reject_evidence` แตะ `assignment_status` ทั้งเคส (อยู่ที่ `field-status.ts`)
 */

export const EXPENSE_ACTIONS = [
  'warehouse_confirm',
  'approve_manager',
  'approve_finance',
  'reject_expense',
  'resubmit_expense',
  'reject_permanent',
  'supersede',
] as const
export type ExpenseAction = (typeof EXPENSE_ACTIONS)[number]

const TRANSITIONS: Readonly<Record<ExpenseAction, { from: readonly ExpenseStatus[]; to: ExpenseStatus }>> = {
  warehouse_confirm: { from: ['pending_warehouse_confirm'], to: 'pending_approval' },
  approve_manager: { from: ['pending_approval'], to: 'pending_finance_approval' },
  approve_finance: { from: ['pending_finance_approval'], to: 'approved' },
  // ตีกลับได้จากทุกขั้นอนุมัติ (`41` §8 — ตรงกับ `23` §6.3)
  reject_expense: { from: ['pending_approval', 'pending_finance_approval'], to: 'needs_revision' },
  // แก้เอกสารแล้วกลับเข้าคิวอนุมัติ — **ไม่ผ่าน `pending_warehouse_confirm` ซ้ำ** (`41` §6.6)
  resubmit_expense: { from: ['needs_revision'], to: 'pending_approval' },
  reject_permanent: { from: ['pending_approval', 'pending_finance_approval'], to: 'rejected' },
  // `41` §10.1 — รายการรอบเดิมถูกแทนที่ด้วยรายการใหม่หลังแก้หลักฐาน
  supersede: {
    from: ['pending_warehouse_confirm', 'pending_approval', 'pending_finance_approval', 'needs_revision', 'approved'],
    to: 'superseded',
  },
}

/** สถานะที่นับเป็น "ยังมีผล" (ไม่ถูกแทนที่/ไม่ถูกปฏิเสธถาวร) — ใช้ทั้ง query และ partial unique ระดับ DB */
export const ACTIVE_EXPENSE_STATUSES: readonly ExpenseStatus[] = [
  'pending_warehouse_confirm',
  'pending_approval',
  'pending_finance_approval',
  'needs_revision',
  'approved',
]

export type ExpenseErrorCode = 'EXPENSE_NOT_FOUND' | 'EXPENSE_INVALID_STATUS' | 'REJECT_REASON_REQUIRED'

export class ExpenseStateError extends ModuleError<ExpenseErrorCode> {
  constructor(code: ExpenseErrorCode, options?: { detail?: string; context?: Record<string, unknown> }) {
    super(code, MESSAGES[code], code === 'EXPENSE_NOT_FOUND' ? 404 : 400, options)
    this.name = 'ExpenseStateError'
  }
}

const MESSAGES: Record<ExpenseErrorCode, { title: string; message: string }> = {
  EXPENSE_NOT_FOUND: {
    title: 'ไม่พบรายการเบิก',
    message: 'ไม่พบรายการเบิกนี้ หรือไม่ใช่รายการของคุณ',
  },
  EXPENSE_INVALID_STATUS: {
    title: 'สถานะรายการเบิกไม่ถูกต้อง',
    message: 'สถานะปัจจุบันของรายการเบิกทำรายการนี้ไม่ได้ (`23` §6.3)',
  },
  REJECT_REASON_REQUIRED: {
    title: 'ต้องระบุเหตุผล',
    message: 'การตีกลับรายการเบิกต้องระบุเหตุผลให้ผู้เบิกเสมอ (`41` §6.6)',
  },
}

/** ปลายทางของ action — สถานะปัจจุบันทำไม่ได้ = `EXPENSE_INVALID_STATUS` */
export function nextExpenseStatus(current: ExpenseStatus, action: ExpenseAction): ExpenseStatus {
  const rule = TRANSITIONS[action]
  if (!rule.from.includes(current)) {
    throw new ExpenseStateError('EXPENSE_INVALID_STATUS', {
      context: { status: current, action },
      detail: `action ${action} ทำได้จากสถานะ ${rule.from.join('|')} เท่านั้น`,
    })
  }
  return rule.to
}

export function canExpenseAction(current: ExpenseStatus, action: ExpenseAction): boolean {
  return TRANSITIONS[action].from.includes(current)
}

/** `41` §6.6 — `reject_expense` บังคับ `reject_reason` เสมอ (Rule 04: reject ต้องมีเหตุผล) */
export function assertRejectReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed.length < 5) throw new ExpenseStateError('REJECT_REASON_REQUIRED')
  return trimmed
}
