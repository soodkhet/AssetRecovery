import { describe, expect, it } from 'vitest'
import { TREND_DAYS, buildFieldDashboard, buildSevenDayTrend, successRatePct } from '@/lib/field/dashboard'
import type { FieldCaseListItemDto } from '@/lib/field/types'

function item(overrides: Partial<FieldCaseListItemDto> = {}): FieldCaseListItemDto {
  return {
    caseId: 'case-1',
    assignmentId: 'assign-1',
    caseRef: 'REF-001',
    trackingRound: 1,
    status: 'scheduled',
    group: 'tracking',
    agentId: 'agent-1',
    agentName: 'สมชาย ใจดี',
    debtorName: 'ลูกหนี้ ก',
    province: 'ชลบุรี',
    district: 'ศรีราชา',
    assetDescription: 'iPhone 15',
    debtAmountSatang: 1_000_000,
    assignedAt: '2026-08-01T03:00:00.000Z',
    acceptedAt: null,
    scheduleDate: '2026-08-14',
    scheduleOrder: 1,
    closedAt: null,
    outcome: null,
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 0,
    commissionSatang: 50_000,
    noSuccessFeeSatang: 20_000,
    reassignedAway: null,
    expenseStatuses: [],
    ...overrides,
  }
}

const TODAY = '2026-08-14'

describe('5 บล็อกของหน้าแรก (`41` §7.1)', () => {
  const active = [
    item({ caseId: 'a', status: 'pending_accept', scheduleDate: null, scheduleOrder: null }),
    item({ caseId: 'b', status: 'accepted_unscheduled', scheduleDate: null, scheduleOrder: null }),
    item({ caseId: 'c', status: 'scheduled', scheduleDate: TODAY, scheduleOrder: 2, hasDraft: true }),
    item({ caseId: 'd', status: 'scheduled', scheduleDate: TODAY, scheduleOrder: 1 }),
    item({ caseId: 'e', status: 'scheduled', scheduleDate: '2026-08-20', scheduleOrder: 1 }),
    item({ caseId: 'f', status: 'needs_revision', scheduleDate: '2026-08-12', scheduleOrder: 1 }),
  ]
  const closed = [
    item({ caseId: 'g', status: 'closed_success', outcome: 'closed_success', closedAt: '2026-08-13T09:00:00.000Z' }),
    item({ caseId: 'h', status: 'closed_fail', outcome: 'closed_fail', closedAt: '2026-08-13T10:00:00.000Z' }),
  ]

  it('เคสที่ต้องไปวันนี้เรียงตามลำดับที่จัดไว้', () => {
    const model = buildFieldDashboard(active, closed, TODAY)
    expect(model.todayCases.map((row) => row.caseId)).toEqual(['d', 'c'])
  })

  it('บล็อก Draft ค้างนับเฉพาะเคสที่ยังทำงานอยู่', () => {
    expect(buildFieldDashboard(active, closed, TODAY).draftCases.map((row) => row.caseId)).toEqual(['c'])
  })

  it('สรุปภาพรวม 3 สถานะ — "กำลังติดตาม" รวมเคสที่ถูกตีกลับหลักฐาน (§7.5)', () => {
    const model = buildFieldDashboard(active, closed, TODAY)
    expect(model.pendingAcceptCount).toBe(1)
    expect(model.trackingCount).toBe(4)
    expect(model.successCount).toBe(1)
    expect(model.unscheduledCount).toBe(1)
  })

  it('ไม่มีเคสวันนี้ = บล็อกว่าง (หน้าจอซ่อนการ์ด)', () => {
    expect(buildFieldDashboard(active, closed, '2026-08-15').todayCases).toHaveLength(0)
  })
})

describe('กราฟแท่ง 7 วัน (`41` §7.1 บล็อก 5)', () => {
  it('มี 7 ช่องเสมอ เรียงเก่า→ใหม่ ลงท้ายวันนี้', () => {
    const trend = buildSevenDayTrend([], TODAY)
    expect(trend).toHaveLength(TREND_DAYS)
    expect(trend[0]?.dateIso).toBe('2026-08-08')
    expect(trend[6]?.dateIso).toBe(TODAY)
  })

  it('นับสำเร็จ/ไม่สำเร็จต่อวัน และคิดความสูงเทียบวันสูงสุด', () => {
    const trend = buildSevenDayTrend(
      [
        { dayIso: '2026-08-14', success: true },
        { dayIso: '2026-08-14', success: true },
        { dayIso: '2026-08-14', success: false },
        { dayIso: '2026-08-12', success: false },
      ],
      TODAY,
    )
    const today = trend[6]
    expect(today?.success).toBe(2)
    expect(today?.fail).toBe(1)
    expect(today?.heightPct).toBe(100)
    expect(today?.successPct).toBe(67)

    const twoDaysAgo = trend.find((day) => day.dateIso === '2026-08-12')
    expect(twoDaysAgo?.total).toBe(1)
    expect(twoDaysAgo?.heightPct).toBe(33)
  })

  it('วันที่ไม่มีเคสเหลือขีดบาง ๆ ไม่ใช่ 0 (และไม่หารศูนย์)', () => {
    const trend = buildSevenDayTrend([], TODAY)
    expect(trend.every((day) => day.heightPct === 4 && day.successPct === 0)).toBe(true)
  })

  it('ข้ามเดือนได้ถูกต้อง', () => {
    const trend = buildSevenDayTrend([{ dayIso: '2026-09-01', success: true }], '2026-09-02')
    expect(trend[0]?.dateIso).toBe('2026-08-27')
    expect(trend.find((day) => day.dateIso === '2026-09-01')?.success).toBe(1)
  })
})

describe('% ความสำเร็จสะสม (`41` §6.8 — ห้ามหารศูนย์ Rule 01)', () => {
  it('ยังไม่เคยปิดงานคืน null', () => {
    expect(successRatePct(0, 0)).toBeNull()
  })

  it('ปัดเป็นจำนวนเต็ม', () => {
    expect(successRatePct(2, 1)).toBe(67)
    expect(successRatePct(3, 0)).toBe(100)
    expect(successRatePct(0, 4)).toBe(0)
  })
})
