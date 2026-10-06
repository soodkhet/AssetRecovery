import { describe, expect, it } from 'vitest'
import {
  ACTIVE_EXPENSE_STATUSES,
  assertRejectReason,
  canExpenseAction,
  ExpenseStateError,
  isFieldDayExpenseHoldable,
  nextExpenseStatus,
  type FieldDayHoldCandidate,
} from '@/lib/field/expense-status'

describe('state machine ของรายการเบิก (`23` §6.3)', () => {
  it('คลังยืนยันแล้วจึงเข้าคิวอนุมัติ', () => {
    expect(nextExpenseStatus('pending_warehouse_confirm', 'warehouse_confirm')).toBe('pending_approval')
  })

  it('ตีกลับได้จากทุกขั้นอนุมัติ (`41` §8)', () => {
    expect(nextExpenseStatus('pending_approval', 'reject_expense')).toBe('needs_revision')
    expect(nextExpenseStatus('pending_finance_approval', 'reject_expense')).toBe('needs_revision')
  })

  it('รายการที่ยังรอคลังยืนยัน ตีกลับเอกสารไม่ได้ (ยังไม่ถึงมือผู้อนุมัติจ่าย)', () => {
    expect(canExpenseAction('pending_warehouse_confirm', 'reject_expense')).toBe(false)
    expect(() => nextExpenseStatus('pending_warehouse_confirm', 'reject_expense')).toThrow(ExpenseStateError)
  })

  it('resubmit กลับเข้า pending_approval — **ไม่ผ่านขั้นคลังซ้ำ** (`41` §6.6/§10.1)', () => {
    expect(nextExpenseStatus('needs_revision', 'resubmit_expense')).toBe('pending_approval')
  })

  it('resubmit จากสถานะอื่นไม่ได้', () => {
    for (const status of ['pending_approval', 'approved', 'rejected', 'superseded'] as const) {
      expect(canExpenseAction(status, 'resubmit_expense')).toBe(false)
    }
  })

  it('supersede ได้ทุกสถานะที่ยังมีผล แต่ทำซ้ำกับตัวที่ superseded แล้วไม่ได้', () => {
    for (const status of ACTIVE_EXPENSE_STATUSES) {
      expect(nextExpenseStatus(status, 'supersede')).toBe('superseded')
    }
    expect(canExpenseAction('superseded', 'supersede')).toBe(false)
    expect(canExpenseAction('rejected', 'supersede')).toBe(false)
  })

  it('error ที่โยนออกมาใช้ code ตามทะเบียน + status 400', () => {
    try {
      nextExpenseStatus('approved', 'resubmit_expense')
      expect.unreachable('ต้องโยน')
    } catch (error) {
      expect(error).toBeInstanceOf(ExpenseStateError)
      expect((error as ExpenseStateError).code).toBe('EXPENSE_INVALID_STATUS')
      expect((error as ExpenseStateError).status).toBe(400)
    }
  })
})

describe('assertRejectReason (`41` §6.6 — reject ต้องมีเหตุผลเสมอ)', () => {
  it('เหตุผลสั้นเกิน/ว่าง = ปฏิเสธ', () => {
    // 'ผิด' = 3 ตัวอักษร ต่ำกว่าขั้นต่ำ 5 ตัวเท่ากับ `REASON_MIN_LENGTH` ของ `<ReasonConfirmModal>`
    for (const reason of [undefined, null, '', '   ', 'ผิด']) {
      expect(() => assertRejectReason(reason)).toThrow(ExpenseStateError)
    }
  })

  it('คืนค่าที่ trim แล้ว', () => {
    expect(assertRejectReason('  ใบเสร็จไม่ชัด อ่านยอดไม่ออก  ')).toBe('ใบเสร็จไม่ชัด อ่านยอดไม่ออก')
  })
})

describe('BUG-092 — แถวรายวันของเคสที่ปิดสำเร็จภายหลังกลับไปรอคลัง', () => {
  const fresh: FieldDayHoldCandidate = {
    status: 'pending_approval',
    fieldDaySettlementId: 'settlement-1',
    approvalStepCurrent: 1,
    managerApprovedAt: null,
    financeApprovedAt: null,
    executiveApprovedAt: null,
    payoutBatchItemId: null,
  }

  it('transition `hold_for_warehouse` ทำได้จาก pending_approval เท่านั้น', () => {
    expect(nextExpenseStatus('pending_approval', 'hold_for_warehouse')).toBe('pending_warehouse_confirm')
    for (const status of ['pending_finance_approval', 'approved', 'needs_revision', 'rejected', 'superseded'] as const) {
      expect(canExpenseAction(status, 'hold_for_warehouse')).toBe(false)
    }
  })

  it('ย้ายได้เฉพาะแถวรายวันที่ยังไม่มีใครอนุมัติและยังไม่เข้ารอบจ่าย', () => {
    expect(isFieldDayExpenseHoldable(fresh)).toBe(true)
    expect(isFieldDayExpenseHoldable({ ...fresh, fieldDaySettlementId: null })).toBe(false)
    expect(isFieldDayExpenseHoldable({ ...fresh, approvalStepCurrent: 2 })).toBe(false)
    expect(isFieldDayExpenseHoldable({ ...fresh, managerApprovedAt: new Date() })).toBe(false)
    expect(isFieldDayExpenseHoldable({ ...fresh, financeApprovedAt: new Date() })).toBe(false)
    expect(isFieldDayExpenseHoldable({ ...fresh, executiveApprovedAt: new Date() })).toBe(false)
    expect(isFieldDayExpenseHoldable({ ...fresh, payoutBatchItemId: 'item-1' })).toBe(false)
    expect(isFieldDayExpenseHoldable({ ...fresh, status: 'approved' })).toBe(false)
    expect(isFieldDayExpenseHoldable({ ...fresh, status: 'needs_revision' })).toBe(false)
  })
})

describe('reject_permanent ตรง `23` §6.3 (มติ PO U117 ข้อ 3 · U118)', () => {
  it('pending_approval / pending_finance_approval / needs_revision → rejected', () => {
    for (const status of ['pending_approval', 'pending_finance_approval', 'needs_revision'] as const) {
      expect(nextExpenseStatus(status, 'reject_permanent')).toBe('rejected')
    }
    for (const status of ['approved', 'rejected', 'superseded', 'pending_warehouse_confirm'] as const) {
      expect(canExpenseAction(status, 'reject_permanent')).toBe(false)
    }
  })
})
