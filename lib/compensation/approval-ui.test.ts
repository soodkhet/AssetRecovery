import { describe, expect, it } from 'vitest'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import {
  approvalHistoryLabel,
  approvalStepText,
  approvalStepTone,
  claimSourceLabel,
  CLAIM_STATUS_FILTERS,
  expenseRowActions,
  expenseRowHighlight,
  pendingClaimTotalSatang,
} from '@/lib/compensation/approval-ui'
import type { ExpenseStatus } from '@/lib/generated/prisma/enums'

function dto(overrides: Partial<CompensationApprovalDto> = {}): CompensationApprovalDto {
  return {
    id: 'exp-1',
    caseId: null,
    caseRef: 'CASE-26-0001',
    debtorName: null,
    agentName: 'พนักงาน ก',
    payeeId: 'payee-1',
    payeeName: 'พนักงาน ก',
    payeeVerified: true,
    expenseType: 'fuel',
    expenseDate: '2026-08-01',
    distanceKm: '128.50',
    calculationSource: 'compensation_plan',
    basisText: '128.50 กม. × 3.50 บาท/กม.',
    grossSatang: 45_000,
    whtSatang: 0,
    netSatang: 45_000,
    whtPctUsed: 0,
    whtRateSource: 'payee',
    whtWarning: null,
    status: 'pending_approval',
    approvalStepCurrent: 1,
    approvalStepTotal: 2,
    pendingStepRole: 'ผู้จัดการทีมติดตามทรัพย์',
    approvalHistory: [],
    rejectReason: null,
    createdAt: '2026-08-01T03:00:00.000Z',
    ...overrides,
  }
}

describe('ปุ่มบนแถว (`16` §8 — อ่านจาก state machine ห้าม if เอง)', () => {
  it('รายการในคิวอนุมัติ + มีสิทธิ์ = อนุมัติ/ตีกลับ/ดูสูตร', () => {
    expect(expenseRowActions({ status: 'pending_approval', canApprove: true })).toEqual([
      'approve',
      'reject',
      'view_formula',
    ])
    expect(expenseRowActions({ status: 'pending_finance_approval', canApprove: true })).toContain('approve')
  })

  it('ไม่มีสิทธิ์อนุมัติ = เหลือแค่ดูสูตร (ปุ่มหายไปเลย ไม่ใช่ปุ่มเทา)', () => {
    expect(expenseRowActions({ status: 'pending_approval', canApprove: false })).toEqual(['view_formula'])
  })

  it('สถานะที่ไม่อยู่ในคิว = เหลือแค่ดูสูตร', () => {
    for (const status of ['approved', 'rejected', 'needs_revision', 'superseded', 'pending_warehouse_confirm'] as ExpenseStatus[]) {
      expect(expenseRowActions({ status, canApprove: true })).toEqual(['view_formula'])
    }
  })
})

describe('stepper ในแถว (`16` §8)', () => {
  it('กำลังรออนุมัติ = บอกขั้นและ role ที่รออยู่', () => {
    expect(approvalStepText(dto())).toBe('ขั้น 1/2: รอ ผู้จัดการทีมติดตามทรัพย์')
  })

  it('ยังไม่ได้ตั้งสายอนุมัติ = บอกให้รู้ ไม่ใช่เงียบ', () => {
    expect(approvalStepText(dto({ pendingStepRole: null }))).toContain('ยังไม่ได้ตั้งสายอนุมัติ')
  })

  it('รายการที่จบแล้วบอกผลแทนเลขขั้น', () => {
    expect(approvalStepText(dto({ status: 'approved' }))).toBe('✓ ผ่านทุกขั้น')
    expect(approvalStepText(dto({ status: 'rejected' }))).toBe('✗ ปฏิเสธ')
    expect(approvalStepText(dto({ status: 'needs_revision' }))).toContain('กลับไปขั้น 1')
    expect(approvalStepText(dto({ status: 'pending_warehouse_confirm' }))).toContain('รอคลังยืนยัน')
  })

  it('สีของ stepper มาจาก 10 กลุ่มของ `04` §8.1', () => {
    expect(approvalStepTone('approved')).toBe('success')
    expect(approvalStepTone('rejected')).toBe('critical')
    expect(approvalStepTone('needs_revision')).toBe('warning')
    expect(approvalStepTone('pending_approval')).toBe('neutral')
  })

  it('บรรทัดประวัติอนุมัติบอกขั้น + role + สัญลักษณ์ผล', () => {
    const label = approvalHistoryLabel(
      { step: 1, approverId: 'u1', approverRole: 'การเงิน', action: 'approve', timestamp: '', reason: null },
      2,
    )
    expect(label).toBe('✓ ขั้น 1/2: การเงิน')
  })
})

describe('ที่มาของรายการ (`15` §8)', () => {
  it('รายการที่คิดจากแผนค่าตอบแทน = อัตโนมัติ', () => {
    expect(claimSourceLabel('compensation_plan')).toContain('อัตโนมัติ')
  })

  it('รายการที่กรอกเอง/ตามใบเสร็จ = บันทึกเอง', () => {
    expect(claimSourceLabel('manual')).toContain('บันทึกเอง')
    expect(claimSourceLabel('receipt')).toContain('บันทึกเอง')
  })
})

describe('รายละเอียดตาราง', () => {
  it('แถวที่ถูกตีกลับถูกเน้นพื้นหลัง', () => {
    expect(expenseRowHighlight('needs_revision')).toBe('bg-orange-50/30')
    expect(expenseRowHighlight('approved')).toBeNull()
  })

  it('ตัวกรอง 5 ตัวตรงกับค่าที่ API รับ', () => {
    expect(CLAIM_STATUS_FILTERS.map((filter) => filter.value)).toEqual([
      'all',
      'pending_approval',
      'pending_finance_approval',
      'needs_revision',
      'approved',
    ])
  })

  it('ยอดรออนุมัติรวมนับเฉพาะรายการที่ยังอยู่ในคิวจริง', () => {
    const total = pendingClaimTotalSatang([
      dto({ id: 'a', status: 'pending_approval', grossSatang: 10_000 }),
      dto({ id: 'b', status: 'pending_finance_approval', grossSatang: 20_000 }),
      dto({ id: 'c', status: 'approved', grossSatang: 90_000 }),
      dto({ id: 'd', status: 'needs_revision', grossSatang: 50_000 }),
    ])
    expect(total).toBe(30_000)
  })
})
