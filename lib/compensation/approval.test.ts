import { describe, expect, it } from 'vitest'
import { EXECUTIVE_ROLE_NAME, FINANCE_ROLE_NAME, TEAM_MANAGER_ROLE_NAME } from '@/lib/auth/constants'
import {
  appendApprovalHistory,
  approvalRoleContract,
  approversInCurrentRound,
  approverStampFor,
  assertActorCanApproveStep,
  canActOnApprovalStep,
  canPermanentlyRejectStep,
  permanentRejectStep,
  CLEARED_APPROVER_STAMPS,
  expenseStatusForPendingStep,
  isApprovalItemVisibleTo,
  parseApprovalHistory,
  type ApprovalActor,
  type ApprovalHistoryEntry,
} from '@/lib/compensation/approval'
import {
  advanceApprovalStep,
  assertApprovalStepInOrder,
  assertNoDuplicateApprover,
  resetApprovalToFirstStep,
} from '@/lib/finance/approval-flow-resolver'
import { SettingsError } from '@/lib/settings/errors'

/**
 * ยามของสายอนุมัติหลายขั้น (ไฟล์ 16 §16) — 2 เคสที่สเปคระบุชื่อไว้ตรง ๆ:
 *  · "อนุมัติข้ามขั้น" ⇒ `APPROVAL_STEP_OUT_OF_ORDER`
 *  · "ตีกลับแล้วเริ่มใหม่" ⇒ กลับไปขั้น 1 ไม่ resume ที่ขั้นที่ตีกลับ
 */

const AT = '2026-08-15T03:00:00.000Z'

function entry(patch: Partial<ApprovalHistoryEntry>): ApprovalHistoryEntry {
  return {
    step: 1,
    approverId: 'user-1',
    approverRole: TEAM_MANAGER_ROLE_NAME,
    action: 'approve',
    timestamp: AT,
    reason: null,
    ...patch,
  }
}

function actor(patch: Partial<ApprovalActor> & { capabilities: ApprovalActor['capabilities'] }): ApprovalActor {
  return { id: 'user-1', isSuperadmin: false, ...patch }
}

describe('approval_history (`16` §7/§13)', () => {
  it('อ่าน JSON ที่รูปร่างพังได้โดยไม่ล้ม — ข้ามเฉพาะแถวที่ใช้ไม่ได้', () => {
    const parsed = parseApprovalHistory([
      entry({}),
      null,
      { step: 'หนึ่ง', approverId: 'x', action: 'approve' },
      { step: 2, approverId: 'user-2', action: 'ยกเลิก' },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.approverId).toBe('user-1')
  })

  it('ค่าที่ไม่ใช่ array (null จาก DB เก่า) คืนประวัติว่าง', () => {
    expect(parseApprovalHistory(null)).toEqual([])
    expect(parseApprovalHistory({ step: 1 })).toEqual([])
  })

  it('เป็น append-only — ของเดิมไม่ถูกแก้', () => {
    const history = [entry({})]
    const appended = appendApprovalHistory(history, entry({ step: 2, approverId: 'user-2' }))
    expect(appended).toHaveLength(2)
    expect(history).toHaveLength(1)
  })
})

describe('ผู้อนุมัติของรอบปัจจุบัน (`16` §9/§10)', () => {
  it('นับเฉพาะรายการหลังการตีกลับครั้งล่าสุด — คนที่อนุมัติรอบก่อนตีกลับกลับมาอนุมัติได้', () => {
    const history = [
      entry({ step: 1, approverId: 'manager' }),
      entry({ step: 2, approverId: 'finance', action: 'reject', reason: 'ใบเสร็จไม่ชัด' }),
      entry({ step: 1, approverId: 'manager' }),
    ]
    expect(approversInCurrentRound(history)).toEqual(['manager'])
  })

  it('ยังไม่เคยตีกลับ = นับทุกคนที่อนุมัติมาแล้ว', () => {
    const history = [entry({ step: 1, approverId: 'manager' }), entry({ step: 2, approverId: 'finance' })]
    expect(approversInCurrentRound(history)).toEqual(['manager', 'finance'])
  })

  it('SoD: คนเดิมอนุมัติขั้น 2 ต่อไม่ได้เมื่อสายเปิด `enforce_segregation_of_duties`', () => {
    const previous = approversInCurrentRound([entry({ step: 1, approverId: 'somchai' })])
    expect(() =>
      assertNoDuplicateApprover({
        enforceSegregationOfDuties: true,
        approverId: 'somchai',
        previousApproverIds: previous,
      }),
    ).toThrow(/SEGREGATION_OF_DUTIES_VIOLATION/)
    expect(() =>
      assertNoDuplicateApprover({
        enforceSegregationOfDuties: false,
        approverId: 'somchai',
        previousApproverIds: previous,
      }),
    ).not.toThrow()
  })
})

describe('ขั้น ↔ สถานะ (`23` §6.3/§6.5)', () => {
  it('รอขั้น 1 = pending_approval · รอขั้น ≥ 2 = pending_finance_approval · ครบทุกขั้น = approved', () => {
    expect(expenseStatusForPendingStep(1)).toBe('pending_approval')
    expect(expenseStatusForPendingStep(2)).toBe('pending_finance_approval')
    expect(expenseStatusForPendingStep(3)).toBe('pending_finance_approval')
    expect(expenseStatusForPendingStep(null)).toBe('approved')
  })

  it('สาย 2 ขั้น: อนุมัติขั้น 1 → รอขั้น 2 · อนุมัติขั้น 2 → approved', () => {
    const afterStep1 = advanceApprovalStep(1, 2)
    expect(expenseStatusForPendingStep(afterStep1.nextStep)).toBe('pending_finance_approval')
    const afterStep2 = advanceApprovalStep(2, 2)
    expect(afterStep2.isComplete).toBe(true)
    expect(expenseStatusForPendingStep(afterStep2.nextStep)).toBe('approved')
  })

  it('สาย 3 ขั้น (เกินเพดาน): ขั้น 2 ยังไม่ approved — ต้องรอ Executive (`16` §6.1)', () => {
    const afterStep2 = advanceApprovalStep(2, 3)
    expect(afterStep2.isComplete).toBe(false)
    expect(expenseStatusForPendingStep(afterStep2.nextStep)).toBe('pending_finance_approval')
    expect(expenseStatusForPendingStep(advanceApprovalStep(3, 3).nextStep)).toBe('approved')
  })

  it('ขั้นที่รอต้องเป็นจำนวนเต็มตั้งแต่ 1 — ค่าพังต้องดัง ไม่ใช่เดาสถานะให้', () => {
    expect(() => expenseStatusForPendingStep(0)).toThrow(RangeError)
    expect(() => expenseStatusForPendingStep(1.5)).toThrow(RangeError)
  })
})

describe('§16 "อนุมัติข้ามขั้น" ⇒ APPROVAL_STEP_OUT_OF_ORDER', () => {
  it('กดอนุมัติขั้น 2 ทั้งที่ขั้น 1 ยังไม่ผ่าน = ปฏิเสธ', () => {
    expect(() => assertApprovalStepInOrder({ requestedStep: 2, currentStep: 1, totalSteps: 2 })).toThrow(
      /APPROVAL_STEP_OUT_OF_ORDER/,
    )
  })

  it('กดอนุมัติขั้นที่ถึงตาจริง = ผ่าน', () => {
    expect(() => assertApprovalStepInOrder({ requestedStep: 1, currentStep: 1, totalSteps: 2 })).not.toThrow()
  })
})

describe('§16 "ตีกลับแล้วเริ่มใหม่" ⇒ กลับขั้น 1 เสมอ', () => {
  it('ตีกลับที่ขั้น 2 แล้วส่งใหม่ ⇒ เริ่มขั้น 1 ไม่ resume ที่ขั้น 2', () => {
    expect(resetApprovalToFirstStep()).toBe(1)
    expect(expenseStatusForPendingStep(resetApprovalToFirstStep())).toBe('pending_approval')
  })

  it('ล้างรอยประทับผู้อนุมัติทุกขั้น — รอบใหม่ต้องผ่านทุกขั้นใหม่ทั้งหมด', () => {
    expect(CLEARED_APPROVER_STAMPS).toEqual({
      managerApprovedBy: null,
      managerApprovedAt: null,
      financeApprovedBy: null,
      financeApprovedAt: null,
      executiveApprovedBy: null,
      executiveApprovedAt: null,
    })
  })
})

describe('role ของขั้น → capability + คอลัมน์ผู้อนุมัติ (`16` §12 · `13` §6.2)', () => {
  it.each([
    [TEAM_MANAGER_ROLE_NAME, 'approve_expense_manager', 'manager'],
    [FINANCE_ROLE_NAME, 'approve_expense_finance', 'finance'],
    [EXECUTIVE_ROLE_NAME, 'approve_expense_executive', 'executive'],
  ])('ชื่อ role ตาม seed "%s" ⇒ %s', (roleName, capability, column) => {
    expect(approvalRoleContract(roleName)).toEqual({ capability, column })
  })

  it.each([
    ['Manager', 'approve_expense_manager'],
    ['FinanceAdmin', 'approve_expense_finance'],
    ['Executive', 'approve_expense_executive'],
  ])('ชื่ออังกฤษที่ `13` §6.2 ยกเป็นตัวอย่าง "%s" ใช้ได้เหมือนกัน', (roleName, capability) => {
    expect(approvalRoleContract(roleName).capability).toBe(capability)
  })

  it('สายที่อ้างบทบาทที่ไม่มี capability รองรับ = ตั้งค่าผิด ⇒ APPROVAL_MATRIX_NOT_FOUND', () => {
    try {
      approvalRoleContract('ฝ่ายจัดซื้อ')
      expect.unreachable('ต้องโยน APPROVAL_MATRIX_NOT_FOUND')
    } catch (error) {
      expect(error).toBeInstanceOf(SettingsError)
      expect((error as SettingsError).code).toBe('APPROVAL_MATRIX_NOT_FOUND')
    }
  })
})

describe('สิทธิ์รายขั้น (`16` §10/§12)', () => {
  it('ถือ capability ของขั้นนั้น ⇒ ผ่าน และได้คอลัมน์ที่ต้องประทับ', () => {
    const contract = assertActorCanApproveStep(
      actor({ capabilities: { approve_expense_finance: 'manage' } }),
      FINANCE_ROLE_NAME,
    )
    expect(contract.column).toBe('finance')
  })

  it('ถือ capability ขั้นการเงิน **ไม่ได้** แปลว่าอนุมัติขั้น Executive แทนได้ ⇒ 403', () => {
    expect(() =>
      assertActorCanApproveStep(actor({ capabilities: { approve_expense_finance: 'manage' } }), EXECUTIVE_ROLE_NAME),
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('มีสิทธิ์แค่ระดับ `view` ก็อนุมัติไม่ได้ (DEC-009)', () => {
    expect(() =>
      assertActorCanApproveStep(actor({ capabilities: { approve_expense_manager: 'view' } }), TEAM_MANAGER_ROLE_NAME),
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('Superadmin ผ่านทุกขั้นโดยไม่ต้องมี record สิทธิ์ (DEC-009)', () => {
    expect(() =>
      assertActorCanApproveStep(actor({ isSuperadmin: true, capabilities: {} }), EXECUTIVE_ROLE_NAME),
    ).not.toThrow()
  })
})

describe('รอยประทับผู้อนุมัติ (`02` §8 · DEC-006/D5)', () => {
  it('ประทับเฉพาะคอลัมน์ของขั้นนั้น ไม่แตะคอลัมน์อื่น', () => {
    const at = new Date(AT)
    expect(approverStampFor('manager', 'user-1', at)).toEqual({ managerApprovedBy: 'user-1', managerApprovedAt: at })
    expect(approverStampFor('executive', 'user-9', at)).toEqual({
      executiveApprovedBy: 'user-9',
      executiveApprovedAt: at,
    })
  })
})

describe('`16` §10 — ผู้อนุมัติขั้น N เห็นเฉพาะรายการที่ถึงขั้นของตน (UAT R6-7)', () => {
  const steps3 = [TEAM_MANAGER_ROLE_NAME, FINANCE_ROLE_NAME, EXECUTIVE_ROLE_NAME]
  const manager = actor({ capabilities: { approve_expense_manager: 'manage' } })
  const finance = actor({ capabilities: { approve_expense_finance: 'manage' } })
  const executive = actor({ capabilities: { approve_expense_executive: 'manage' } })

  it('รายการรอขั้น 1 (ผู้จัดการ) ⇒ การเงิน/บริหารไม่เห็น ผู้จัดการเห็นและกดได้', () => {
    const item = { status: 'pending_approval' as const, approvalStepCurrent: 1, steps: steps3 }
    expect(isApprovalItemVisibleTo(manager, item)).toBe(true)
    expect(canActOnApprovalStep(manager, item)).toBe(true)
    expect(isApprovalItemVisibleTo(finance, item)).toBe(false)
    expect(isApprovalItemVisibleTo(executive, item)).toBe(false)
  })

  it('รายการรอขั้น 2 (การเงิน) ⇒ การเงินเห็น+กดได้ · ผู้จัดการเห็นแต่กดไม่ได้ · บริหารยังไม่เห็น', () => {
    const item = { status: 'pending_finance_approval' as const, approvalStepCurrent: 2, steps: steps3 }
    expect(isApprovalItemVisibleTo(finance, item)).toBe(true)
    expect(canActOnApprovalStep(finance, item)).toBe(true)
    expect(isApprovalItemVisibleTo(manager, item)).toBe(true)
    expect(canActOnApprovalStep(manager, item)).toBe(false)
    expect(isApprovalItemVisibleTo(executive, item)).toBe(false)
  })

  it('รายการรอขั้น 3 (บริหาร) ⇒ บริหารเห็น+กดได้ · การเงินเห็นแต่กดไม่ได้', () => {
    const item = { status: 'pending_finance_approval' as const, approvalStepCurrent: 3, steps: steps3 }
    expect(canActOnApprovalStep(executive, item)).toBe(true)
    expect(isApprovalItemVisibleTo(finance, item)).toBe(true)
    expect(canActOnApprovalStep(finance, item)).toBe(false)
  })

  it('อนุมัติแล้ว/ถูกตีกลับ = ไม่ได้รอใคร ⇒ ผู้อนุมัติเห็นเป็นประวัติ แต่ไม่มีใครกดได้', () => {
    for (const status of ['approved', 'needs_revision'] as const) {
      const item = { status, approvalStepCurrent: 1, steps: steps3 }
      expect(isApprovalItemVisibleTo(executive, item)).toBe(true)
      expect(canActOnApprovalStep(actor({ isSuperadmin: true, capabilities: {} }), item)).toBe(false)
    }
  })

  it('สิทธิ์ระดับ view เห็นได้แต่กดไม่ได้ · Superadmin เห็นและกดได้ทุกขั้น', () => {
    const item = { status: 'pending_approval' as const, approvalStepCurrent: 1, steps: steps3 }
    const viewer = actor({ capabilities: { approve_expense_manager: 'view' } })
    expect(isApprovalItemVisibleTo(viewer, item)).toBe(true)
    expect(canActOnApprovalStep(viewer, item)).toBe(false)
    const superadmin = actor({ isSuperadmin: true, capabilities: {} })
    expect(isApprovalItemVisibleTo(superadmin, item)).toBe(true)
    expect(canActOnApprovalStep(superadmin, item)).toBe(true)
  })
})

describe('มติ PO U118 — ขั้นเจ้าของการปฏิเสธถาวร', () => {
  const steps3 = [TEAM_MANAGER_ROLE_NAME, FINANCE_ROLE_NAME, EXECUTIVE_ROLE_NAME]
  const manager = actor({ capabilities: { approve_expense_manager: 'manage' } })
  const finance = actor({ capabilities: { approve_expense_finance: 'manage' } })
  const sentBackAt2 = [entry({ step: 1, action: 'approve' }), entry({ step: 2, action: 'reject', reason: 'ไม่ชัด' })]

  it('needs_revision = ขั้นที่ตีกลับล่าสุด · สถานะอื่น = ขั้นที่รออยู่', () => {
    expect(permanentRejectStep({ status: 'needs_revision', approvalStepCurrent: 1, history: sentBackAt2 })).toBe(2)
    expect(permanentRejectStep({ status: 'needs_revision', approvalStepCurrent: 1, history: [] })).toBe(1)
    expect(permanentRejectStep({ status: 'pending_finance_approval', approvalStepCurrent: 2, history: sentBackAt2 })).toBe(2)
  })

  it('สิทธิ์ตามขั้นเจ้าของ · สถานะจบแล้วไม่มีใครกดได้', () => {
    const revised = { status: 'needs_revision' as const, approvalStepCurrent: 1, steps: steps3, history: sentBackAt2 }
    expect(canPermanentlyRejectStep(finance, revised)).toBe(true)
    expect(canPermanentlyRejectStep(manager, revised)).toBe(false)
    const atFinance = { status: 'pending_finance_approval' as const, approvalStepCurrent: 2, steps: steps3, history: [] }
    expect(canPermanentlyRejectStep(finance, atFinance)).toBe(true)
    expect(canPermanentlyRejectStep(manager, atFinance)).toBe(false)
    const approved = { status: 'approved' as const, approvalStepCurrent: 3, steps: steps3, history: [] }
    expect(canPermanentlyRejectStep(actor({ isSuperadmin: true, capabilities: {} }), approved)).toBe(false)
  })
})
