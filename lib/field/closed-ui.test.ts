import { describe, expect, it } from 'vitest'
import {
  CLOSED_FILTERS,
  CLOSED_FILTER_ACTIVE_CLASS,
  CLOSED_FILTER_LABEL,
  REASSIGN_TIMEOUT_REASON,
  closedCardExpenseStatus,
  closedCardInstant,
  closedMonthKeys,
  filterClosedCases,
  matchesClosedFilter,
  reassignReasonText,
} from '@/lib/field/closed-ui'
import { ALL_MONTHS } from '@/lib/field/month-filter'
import type { FieldCaseListItemDto } from '@/lib/field/types'

function item(overrides: Partial<FieldCaseListItemDto> = {}): FieldCaseListItemDto {
  return {
    caseId: 'case-1',
    assignmentId: 'assign-1',
    caseRef: 'REF-001',
    trackingRound: 1,
    status: 'closed_success',
    group: 'closed',
    agentId: 'agent-1',
    agentName: 'สมชาย ใจดี',
    debtorName: 'ลูกหนี้ ก',
    province: 'ชลบุรี',
    district: 'ศรีราชา',
    assetDescription: 'iPhone 15',
    debtAmountSatang: 1_000_000,
    assignedAt: '2026-08-01T03:00:00.000Z',
    acceptedAt: '2026-08-01T04:00:00.000Z',
    scheduleDate: '2026-08-05',
    scheduleOrder: 1,
    closedAt: '2026-08-05T09:00:00.000Z',
    outcome: 'closed_success',
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 2,
    commissionSatang: 50_000,
    noSuccessFeeSatang: 20_000,
    reassignedAway: null,
    expenseStatuses: [],
    ...overrides,
  }
}

const reassigned = item({
  caseId: 'case-9',
  assignmentId: 'assign-9',
  status: 'reassigned_away',
  outcome: null,
  closedAt: null,
  expenseStatuses: [],
  reassignedAway: {
    toAgentName: 'สมหญิง ขยัน',
    reassignedAt: '2026-08-07T02:00:00.000Z',
    reason: 'พนักงานลาป่วยกะทันหัน',
    resolution: 'consented',
  },
})

describe('pill filter 4 ตัว (`41` §7.11)', () => {
  it('ครบ 4 ตัวและมีป้าย/สีทุกตัว', () => {
    expect(CLOSED_FILTERS).toEqual(['all', 'success', 'fail', 'reassigned'])
    for (const filter of CLOSED_FILTERS) {
      expect(CLOSED_FILTER_LABEL[filter]).toBeTruthy()
      expect(CLOSED_FILTER_ACTIVE_CLASS[filter]).toBeTruthy()
    }
    expect(CLOSED_FILTER_LABEL.reassigned).toBe('ถูกโอนไป')
  })

  it('แต่ละ pill คัดสถานะของตัวเอง', () => {
    const fail = item({ status: 'closed_fail', outcome: 'closed_fail' })
    expect(matchesClosedFilter(item(), 'success')).toBe(true)
    expect(matchesClosedFilter(fail, 'success')).toBe(false)
    expect(matchesClosedFilter(fail, 'fail')).toBe(true)
    expect(matchesClosedFilter(reassigned, 'reassigned')).toBe(true)
    expect(matchesClosedFilter(reassigned, 'fail')).toBe(false)
    expect(matchesClosedFilter(reassigned, 'all')).toBe(true)
  })
})

describe('เวลาอ้างอิงของการ์ด', () => {
  it('ปิดงานใช้ closedAt · ถูกโอนใช้เวลาที่ถูกโอน', () => {
    expect(closedCardInstant(item())).toBe('2026-08-05T09:00:00.000Z')
    expect(closedCardInstant(reassigned)).toBe('2026-08-07T02:00:00.000Z')
  })

  it('ตัวเลือกเดือนคิดจากเวลาไทยของการ์ด', () => {
    // 31/07 18:00 UTC = 01/08 01:00 น. ไทย ⇒ เดือน 8
    const lateNight = item({ closedAt: '2026-07-31T18:00:00.000Z' })
    expect(closedMonthKeys([item(), reassigned, lateNight])).toEqual(['2026-08', '2026-08', '2026-08'])
  })
})

describe('pill + เดือนทำงานร่วมกัน (`41` §7.11)', () => {
  const items = [
    item(),
    item({ caseId: 'case-2', status: 'closed_fail', outcome: 'closed_fail', closedAt: '2026-07-20T09:00:00.000Z' }),
    reassigned,
  ]

  it('ไม่กรองเดือน = ครบทุกใบ เรียงใหม่→เก่า', () => {
    expect(filterClosedCases(items, 'all', ALL_MONTHS).map((row) => row.caseId)).toEqual([
      'case-9',
      'case-1',
      'case-2',
    ])
  })

  it('pill + เดือนพร้อมกัน', () => {
    expect(filterClosedCases(items, 'fail', '2026-07').map((row) => row.caseId)).toEqual(['case-2'])
    expect(filterClosedCases(items, 'fail', '2026-08')).toHaveLength(0)
    expect(filterClosedCases(items, 'reassigned', '2026-08').map((row) => row.caseId)).toEqual(['case-9'])
  })
})

describe('การ์ด reassigned_away ต่างจากการ์ดปิดงาน (`41` §7.11)', () => {
  it('ไม่มีสถานะค่าใช้จ่ายเสมอ แม้จะมีข้อมูลติดมา', () => {
    const withExpense = { ...reassigned, expenseStatuses: ['approved' as const] }
    expect(closedCardExpenseStatus(withExpense)).toBeNull()
  })

  it('การ์ดปิดงานแสดงสถานะรวมของรายการเบิก', () => {
    expect(closedCardExpenseStatus(item({ expenseStatuses: ['approved', 'pending_warehouse_confirm'] }))).toBe(
      'pending_warehouse_confirm',
    )
    expect(closedCardExpenseStatus(item({ expenseStatuses: [] }))).toBeNull()
  })

  it('เหตุผล: หมดเวลาตอบรับใช้ข้อความมาตรฐาน · ยินยอมเองใช้เหตุผลของผู้จัดการ', () => {
    expect(reassignReasonText(reassigned)).toBe('พนักงานลาป่วยกะทันหัน')
    const timeout = {
      ...reassigned,
      reassignedAway: { ...reassigned.reassignedAway!, resolution: 'timeout_auto' as const },
    }
    expect(reassignReasonText(timeout)).toBe(REASSIGN_TIMEOUT_REASON)
    expect(reassignReasonText(item())).toBeNull()
  })
})
