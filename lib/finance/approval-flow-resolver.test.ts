import { describe, expect, it } from 'vitest'
import {
  advanceApprovalStep,
  APPROVAL_FIRST_STEP,
  assertApprovalStepInOrder,
  assertNoDuplicateApprover,
  resetApprovalToFirstStep,
  resolveApprovalFlow,
  type ApprovalMatrixCandidate,
} from '@/lib/finance/approval-flow-resolver'
import { isFinanceError } from '@/lib/finance/errors'
import { isSettingsError } from '@/lib/settings/errors'

/** `16` §6.1/§9/§16 · `13` §6.2 — สายอนุมัติ: matrix → รายการขั้น */

const matrices: ApprovalMatrixCandidate[] = [
  {
    id: 'normal',
    condition: 'รายการเบิกปกติไม่เกินเพดาน',
    conditionThresholdSatang: 500_000, // ฿5,000
    approvalFlow: ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'],
    enforceSegregationOfDuties: false,
  },
  {
    id: 'over-threshold',
    condition: 'รายการเบิกเกินเพดาน',
    conditionThresholdSatang: null,
    approvalFlow: ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน', 'บริหาร'],
    enforceSegregationOfDuties: true,
  },
]

describe('resolveApprovalFlow — เลือกสายตามเพดานเงิน (`16` §6.1)', () => {
  it('ไม่เกินเพดาน → สาย 2 ขั้น (ผู้จัดการ → การเงิน)', () => {
    const flow = resolveApprovalFlow(300_000, matrices)
    expect(flow.matrixId).toBe('normal')
    expect(flow.totalSteps).toBe(2)
    expect(flow.steps).toEqual([
      { step: 1, role: 'ผู้จัดการทีมติดตามทรัพย์' },
      { step: 2, role: 'การเงิน' },
    ])
  })

  it('ยอดเท่าเพดานพอดี = ยังอยู่ในสายปกติ ("เกินเพดาน" คือมากกว่าเท่านั้น)', () => {
    expect(resolveApprovalFlow(500_000, matrices).matrixId).toBe('normal')
  })

  it('เกินเพดาน → สาย 3 ขั้น (เพิ่มบริหาร) + บังคับแยกหน้าที่ตามที่ตั้งไว้', () => {
    const flow = resolveApprovalFlow(500_001, matrices)
    expect(flow.matrixId).toBe('over-threshold')
    expect(flow.totalSteps).toBe(3)
    expect(flow.enforceSegregationOfDuties).toBe(true)
  })

  it('มีหลายเพดาน → เลือกเพดานต่ำสุดที่ยังครอบยอดนี้ได้ (ลำดับใน array ไม่มีผล)', () => {
    const many: ApprovalMatrixCandidate[] = [
      { ...matrices[1] as ApprovalMatrixCandidate },
      { ...matrices[0] as ApprovalMatrixCandidate },
      {
        id: 'small',
        condition: 'ยอดเล็ก',
        conditionThresholdSatang: 100_000,
        approvalFlow: ['การเงิน'],
        enforceSegregationOfDuties: false,
      },
    ]
    expect(resolveApprovalFlow(50_000, many).matrixId).toBe('small')
    expect(resolveApprovalFlow(150_000, many).matrixId).toBe('normal')
  })

  it('สายที่ไม่มีขั้นเลยถูกข้าม (ตัวตั้งค่าพัง)', () => {
    const broken: ApprovalMatrixCandidate[] = [
      { id: 'empty', condition: 'ว่าง', conditionThresholdSatang: 500_000, approvalFlow: [], enforceSegregationOfDuties: false },
      ...matrices,
    ]
    expect(resolveApprovalFlow(300_000, broken).matrixId).toBe('normal')
  })

  it('ไม่มีสายไหนครอบยอดนี้ → APPROVAL_MATRIX_NOT_FOUND (ห้ามเดาสายให้เอง)', () => {
    const onlyCapped = [matrices[0] as ApprovalMatrixCandidate]
    try {
      resolveApprovalFlow(900_000, onlyCapped)
      expect.unreachable('ต้องโยน APPROVAL_MATRIX_NOT_FOUND')
    } catch (error) {
      expect(isSettingsError(error) && error.code).toBe('APPROVAL_MATRIX_NOT_FOUND')
    }
  })

  it('ยอดติดลบ = ล้ม', () => {
    expect(() => resolveApprovalFlow(-1, matrices)).toThrow(RangeError)
  })
})

describe('เดินขั้นอนุมัติ (`16` §9)', () => {
  it('ผ่านขั้น 1 จาก 3 → ขั้นถัดไป 2 ยังไม่จบ', () => {
    expect(advanceApprovalStep(1, 3)).toEqual({ nextStep: 2, isComplete: false })
  })

  it('ผ่านขั้นสุดท้าย → จบสาย ⇒ approved', () => {
    expect(advanceApprovalStep(3, 3)).toEqual({ nextStep: null, isComplete: true })
  })

  it('สายขั้นเดียว: ผ่านขั้น 1 = จบทันที', () => {
    expect(advanceApprovalStep(1, 1)).toEqual({ nextStep: null, isComplete: true })
  })

  it('ขั้นปัจจุบันนอกช่วง/ไม่ใช่จำนวนเต็ม = ล้ม', () => {
    expect(() => advanceApprovalStep(0, 3)).toThrow(RangeError)
    expect(() => advanceApprovalStep(4, 3)).toThrow(RangeError)
    expect(() => advanceApprovalStep(1, 0)).toThrow(RangeError)
    expect(() => advanceApprovalStep(1.5, 3)).toThrow(RangeError)
  })

  it('ตีกลับแล้วเริ่มขั้น 1 ใหม่เสมอ ไม่ resume ขั้นที่ค้าง (`16` §16)', () => {
    expect(resetApprovalToFirstStep()).toBe(APPROVAL_FIRST_STEP)
    expect(resetApprovalToFirstStep()).toBe(1)
  })
})

describe('ยามลำดับขั้นและการแยกหน้าที่', () => {
  it('อนุมัติขั้นที่ยังไม่ถึงตา → APPROVAL_STEP_OUT_OF_ORDER (`16` §16)', () => {
    try {
      assertApprovalStepInOrder({ requestedStep: 2, currentStep: 1, totalSteps: 3 })
      expect.unreachable('ต้องโยน APPROVAL_STEP_OUT_OF_ORDER')
    } catch (error) {
      expect(isFinanceError(error) && error.code).toBe('APPROVAL_STEP_OUT_OF_ORDER')
    }
  })

  it('อนุมัติขั้นที่ถึงตาพอดี → ผ่าน', () => {
    expect(() => assertApprovalStepInOrder({ requestedStep: 1, currentStep: 1, totalSteps: 3 })).not.toThrow()
  })

  it('ย้อนกลับไปอนุมัติขั้นที่ผ่านไปแล้วก็ไม่ได้', () => {
    expect(() => assertApprovalStepInOrder({ requestedStep: 1, currentStep: 2, totalSteps: 3 })).toThrow()
  })

  it('บังคับแยกหน้าที่: คนเดิมอนุมัติซ้ำขั้น → SEGREGATION_OF_DUTIES_VIOLATION (403)', () => {
    try {
      assertNoDuplicateApprover({
        enforceSegregationOfDuties: true,
        approverId: 'user-1',
        previousApproverIds: ['user-1'],
      })
      expect.unreachable('ต้องโยน SEGREGATION_OF_DUTIES_VIOLATION')
    } catch (error) {
      expect(isFinanceError(error)).toBe(true)
      if (isFinanceError(error)) {
        expect(error.code).toBe('SEGREGATION_OF_DUTIES_VIOLATION')
        expect(error.status).toBe(403)
      }
    }
  })

  it('ไม่บังคับแยกหน้าที่ (ค่าเริ่มต้นของทีมเล็ก) → คนเดิมอนุมัติหลายขั้นได้', () => {
    expect(() =>
      assertNoDuplicateApprover({
        enforceSegregationOfDuties: false,
        approverId: 'user-1',
        previousApproverIds: ['user-1'],
      }),
    ).not.toThrow()
  })

  it('คนละคนอนุมัติ → ผ่านแม้บังคับแยกหน้าที่', () => {
    expect(() =>
      assertNoDuplicateApprover({
        enforceSegregationOfDuties: true,
        approverId: 'user-2',
        previousApproverIds: ['user-1'],
      }),
    ).not.toThrow()
  })
})
