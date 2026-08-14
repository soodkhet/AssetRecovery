import { describe, expect, it } from 'vitest'
import {
  MAX_APPROVAL_STEPS,
  describeApprovalFlow,
  duplicateApprovalSteps,
  isApprovalFlowConsistent,
  isApprovalFlowShapeValid,
  normalizeApprovalMatrixValues,
  sortApprovalMatrices,
  toApprovalMatrixAuditPayload,
  type ApprovalMatrixValues,
} from '@/lib/settings/approval-matrix'

/** `13` §6.2 — เพดานเงินเป็น **satang** · `enforce_segregation_of_duties` (ไฟล์ 16) */

const base: ApprovalMatrixValues = {
  condition: ' Claim ปกติไม่เกินเพดาน ',
  conditionThresholdSatang: 500_000,
  approvalFlow: [' ผู้จัดการ ', 'การเงิน', '  '],
  enforceSegregationOfDuties: false,
}

describe('normalizeApprovalMatrixValues', () => {
  it('ตัดช่องว่าง + ทิ้งขั้นที่ว่างเปล่า', () => {
    const values = normalizeApprovalMatrixValues(base)
    expect(values.condition).toBe('Claim ปกติไม่เกินเพดาน')
    expect(values.approvalFlow).toEqual(['ผู้จัดการ', 'การเงิน'])
  })

  it('เพดาน null (ไม่อ้างเงิน) คงเป็น null', () => {
    expect(normalizeApprovalMatrixValues({ ...base, conditionThresholdSatang: null }).conditionThresholdSatang).toBeNull()
  })

  it('เพดานเก็บเป็นสตางค์ ไม่แปลงหน่วยซ้ำ (5,000 บาท = 500,000)', () => {
    expect(normalizeApprovalMatrixValues(base).conditionThresholdSatang).toBe(500_000)
  })
})

describe('isApprovalFlowShapeValid', () => {
  it('ต้องมีอย่างน้อย 1 ขั้น', () => {
    expect(isApprovalFlowShapeValid([])).toBe(false)
    expect(isApprovalFlowShapeValid(['การเงิน'])).toBe(true)
  })

  it('ไม่เกินเพดานขั้นอนุมัติ', () => {
    expect(isApprovalFlowShapeValid(Array.from({ length: MAX_APPROVAL_STEPS }, (_, i) => `role${i}`))).toBe(true)
    expect(isApprovalFlowShapeValid(Array.from({ length: MAX_APPROVAL_STEPS + 1 }, (_, i) => `role${i}`))).toBe(false)
  })
})

describe('duplicateApprovalSteps', () => {
  it('คืนบทบาทที่ซ้ำ', () => {
    expect(duplicateApprovalSteps(['ผู้จัดการ', 'การเงิน', 'ผู้จัดการ'])).toEqual(['ผู้จัดการ'])
  })

  it('ไม่ซ้ำ = ว่าง', () => {
    expect(duplicateApprovalSteps(['ผู้จัดการ', 'การเงิน'])).toEqual([])
  })
})

describe('isApprovalFlowConsistent', () => {
  it('ไม่บังคับแยกหน้าที่ = ใส่บทบาทซ้ำได้ (ทีมเล็กคนจำกัด — `13` §6.2)', () => {
    expect(
      isApprovalFlowConsistent({ approvalFlow: ['การเงิน', 'การเงิน'], enforceSegregationOfDuties: false }),
    ).toBe(true)
  })

  it('บังคับแยกหน้าที่ + บทบาทซ้ำ = ใช้ไม่ได้ (สายจะเดินไม่จบ)', () => {
    expect(
      isApprovalFlowConsistent({ approvalFlow: ['การเงิน', 'การเงิน'], enforceSegregationOfDuties: true }),
    ).toBe(false)
  })

  it('สายว่าง = ใช้ไม่ได้เสมอ', () => {
    expect(isApprovalFlowConsistent({ approvalFlow: [], enforceSegregationOfDuties: false })).toBe(false)
  })
})

describe('describeApprovalFlow', () => {
  it('ต่อด้วยลูกศรตามลำดับ', () => {
    expect(describeApprovalFlow(['ผู้จัดการ', 'การเงิน', 'บริหาร'])).toBe('ผู้จัดการ → การเงิน → บริหาร')
  })

  it('สายว่างแสดงขีด', () => {
    expect(describeApprovalFlow([])).toBe('—')
  })
})

describe('sortApprovalMatrices', () => {
  it('เพดานน้อย→มาก แล้วสายที่ไม่อ้างเพดานไว้ท้าย', () => {
    const rows = [
      { id: 'none', conditionThresholdSatang: null },
      { id: 'high', conditionThresholdSatang: 1_000_000 },
      { id: 'low', conditionThresholdSatang: 500_000 },
    ]
    expect(sortApprovalMatrices(rows).map((row) => row.id)).toEqual(['low', 'high', 'none'])
  })

  it('ไม่แก้ array เดิม', () => {
    const rows = [{ conditionThresholdSatang: 2 }, { conditionThresholdSatang: 1 }]
    sortApprovalMatrices(rows)
    expect(rows.map((row) => row.conditionThresholdSatang)).toEqual([2, 1])
  })
})

describe('toApprovalMatrixAuditPayload', () => {
  it('ใช้ชื่อคอลัมน์ snake_case ตามตารางจริง', () => {
    expect(toApprovalMatrixAuditPayload(normalizeApprovalMatrixValues(base))).toEqual({
      condition: 'Claim ปกติไม่เกินเพดาน',
      condition_threshold_satang: 500_000,
      approval_flow: ['ผู้จัดการ', 'การเงิน'],
      enforce_segregation_of_duties: false,
    })
  })
})
