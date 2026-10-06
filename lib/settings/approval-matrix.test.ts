import { describe, expect, it } from 'vitest'
import {
  MAX_APPROVAL_STEPS,
  approvalRoleColumn,
  approvalRoleOptions,
  invalidApprovalSteps,
  approvalFlowRoleNames,
  describeApprovalFlow,
  duplicateApprovalSteps,
  isApprovalFlowConsistent,
  isApprovalFlowShapeValid,
  normalizeApprovalMatrixValues,
  sortApprovalMatrices,
  toApprovalMatrixAuditPayload,
  type ApprovalMatrixValues,
  type ApprovalRoleRef,
} from '@/lib/settings/approval-matrix'

/** `13` §6.2 — เพดานเงินเป็น **satang** · `enforce_segregation_of_duties` (ไฟล์ 16) */

const base: ApprovalMatrixValues = {
  condition: ' Claim ปกติไม่เกินเพดาน ',
  conditionThresholdSatang: 500_000,
  approvalFlowRoleIds: [' role-manager ', 'role-finance', '  '],
  enforceSegregationOfDuties: false,
}

describe('normalizeApprovalMatrixValues', () => {
  it('ตัดช่องว่าง + ทิ้งขั้นที่ว่างเปล่า', () => {
    const values = normalizeApprovalMatrixValues(base)
    expect(values.condition).toBe('Claim ปกติไม่เกินเพดาน')
    expect(values.approvalFlowRoleIds).toEqual(['role-manager', 'role-finance'])
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
      isApprovalFlowConsistent({ approvalFlowRoleIds: ['การเงิน', 'การเงิน'], enforceSegregationOfDuties: false }),
    ).toBe(true)
  })

  it('บังคับแยกหน้าที่ + บทบาทซ้ำ = ใช้ไม่ได้ (สายจะเดินไม่จบ)', () => {
    expect(
      isApprovalFlowConsistent({ approvalFlowRoleIds: ['การเงิน', 'การเงิน'], enforceSegregationOfDuties: true }),
    ).toBe(false)
  })

  it('สายว่าง = ใช้ไม่ได้เสมอ', () => {
    expect(isApprovalFlowConsistent({ approvalFlowRoleIds: [], enforceSegregationOfDuties: false })).toBe(false)
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
      approval_flow_role_ids: ['role-manager', 'role-finance'],
      enforce_segregation_of_duties: false,
    })
  })
})

describe('ตัวเลือก role ของสายอนุมัติ (UAT BUG-008 · มติ PO U149 — เก็บ role id)', () => {
  const role = (id: string, name: string, roleGroup: ApprovalRoleRef['roleGroup'], isSeed = true): ApprovalRoleRef => ({
    id,
    name,
    roleGroup,
    isSeed,
  })
  const orgRoles: ApprovalRoleRef[] = [
    role('mgr-out', 'ผู้จัดการทีมติดตามทรัพย์', 'outsource'),
    role('mgr-in', 'ผู้จัดการทีมติดตามทรัพย์', 'inhouse'),
    role('fin', 'การเงิน', 'system'),
    role('exe', 'บริหาร', 'system'),
    role('admin', 'ธุรการ', 'system'),
    role('sa', 'Superadmin', 'system'),
    // ชื่อซ้ำข้ามกลุ่ม/role สร้างเอง — ต้องไม่ถูกจับคู่เป็นผู้อนุมัติ (ND-7)
    role('fc-mgr', 'ผู้จัดการ', 'finance_company'),
    role('custom-fin', 'การเงิน', 'finance_company', false),
    role('custom-en', 'Finance', 'system', false),
  ]

  it('approvalRoleOptions() = role seed ผู้อนุมัติ 1 ตัวต่อขั้น (ผู้จัดการทีมใช้ record inhouse) เรียง ผู้จัดการ → การเงิน → บริหาร', () => {
    expect(approvalRoleOptions(orgRoles)).toEqual([
      { id: 'mgr-in', name: 'ผู้จัดการทีมติดตามทรัพย์', column: 'manager' },
      { id: 'fin', name: 'การเงิน', column: 'finance' },
      { id: 'exe', name: 'บริหาร', column: 'executive' },
    ])
  })

  it('role ที่ถูกลบแล้วไม่เป็นตัวเลือก', () => {
    const roles = orgRoles.map((item) => (item.id === 'exe' ? { ...item, deletedAt: '2026-10-07T00:00:00Z' } : item))
    expect(approvalRoleOptions(roles).map((option) => option.id)).toEqual(['mgr-in', 'fin'])
  })

  it('invalidApprovalSteps() คืน role id ที่ไม่ใช่ผู้อนุมัติ/ไม่มีในองค์กร/ชื่อซ้ำข้ามกลุ่ม', () => {
    expect(invalidApprovalSteps(['mgr-in', 'fin'], orgRoles)).toEqual([])
    expect(invalidApprovalSteps(['mgr-in', 'admin', 'fc-mgr', 'custom-fin', 'custom-en', 'ghost'], orgRoles)).toEqual([
      'admin',
      'fc-mgr',
      'custom-fin',
      'custom-en',
      'ghost',
    ])
  })

  it('approvalFlowRoleNames() อ่านชื่อปัจจุบันจาก id — เปลี่ยนชื่อ role แล้วสายยังชี้ role เดิม', () => {
    const before = new Map([
      ['mgr-in', 'ผู้จัดการทีมติดตามทรัพย์'],
      ['fin', 'การเงิน'],
    ])
    expect(approvalFlowRoleNames(['mgr-in', 'fin'], before)).toEqual(['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'])
    const renamed = new Map(before).set('fin', 'ฝ่ายการเงิน')
    expect(approvalFlowRoleNames(['mgr-in', 'fin'], renamed)).toEqual(['ผู้จัดการทีมติดตามทรัพย์', 'ฝ่ายการเงิน'])
    expect(approvalFlowRoleNames(['ghost'], before)).toEqual([''])
  })

  it('approvalRoleColumn() ใช้ตัวจับคู่เดียวกับตัวอนุมัติ', () => {
    expect(approvalRoleColumn('การเงิน')).toBe('finance')
    expect(approvalRoleColumn(' Finance Admin ')).toBe('finance')
    expect(approvalRoleColumn('ฝ่ายจัดซื้อ')).toBeNull()
  })
})
