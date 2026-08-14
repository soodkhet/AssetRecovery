import { describe, expect, it } from 'vitest'
import {
  EMPTY_REASSIGNMENT_WATCH,
  declineReasonError,
  nextReassignmentPopup,
  pendingReassignmentCases,
  reassignedAwayMessage,
  reassignmentCountdown,
  trackReassignments,
} from '@/lib/field/reassignment-ui'
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
    acceptedAt: '2026-08-01T04:00:00.000Z',
    scheduleDate: '2026-08-20',
    scheduleOrder: 1,
    closedAt: null,
    outcome: null,
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 0,
    commissionSatang: null,
    noSuccessFeeSatang: null,
    ...overrides,
  }
}

describe('auto-popup (`41` §7.8 · §20)', () => {
  const cases = [
    item({ caseId: 'a', hasPendingReassignment: true }),
    item({ caseId: 'b' }),
    item({ caseId: 'c', hasPendingReassignment: true }),
  ]

  it('มีคำขอค้าง = เด้ง popup เคสแรกที่ยังไม่ได้กด "ดูทีหลัง"', () => {
    expect(pendingReassignmentCases(cases).map((entry) => entry.caseId)).toEqual(['a', 'c'])
    expect(nextReassignmentPopup(cases, [])?.caseId).toBe('a')
  })

  it('กด "ดูทีหลัง" แล้วไม่เด้งซ้ำในเซสชันนี้ แต่เคสอื่นยังเด้งต่อ', () => {
    expect(nextReassignmentPopup(cases, ['a'])?.caseId).toBe('c')
    expect(nextReassignmentPopup(cases, ['a', 'c'])).toBeNull()
  })

  it('badge ไม่เกี่ยวกับ dismiss — คำขอที่กดดูทีหลังยังนับอยู่', () => {
    expect(pendingReassignmentCases(cases)).toHaveLength(2)
  })
})

describe('declineReasonError (`40` §8 DECLINE_REASON_REQUIRED)', () => {
  it('ไม่กรอกเหตุผล/เว้นวรรคล้วน = ยืนยันไม่ได้', () => {
    expect(declineReasonError('')).not.toBeNull()
    expect(declineReasonError('   ')).not.toBeNull()
  })

  it('กรอกแล้ว = ผ่าน', () => {
    expect(declineReasonError('กำลังเดินทางไปหาลูกหนี้แล้ว')).toBeNull()
  })
})

describe('reassignmentCountdown', () => {
  const now = new Date('2026-08-20T03:00:00.000Z')

  it('เหลือมากกว่า 1 ชั่วโมง = บอกทั้งชั่วโมงและนาที', () => {
    expect(reassignmentCountdown('2026-08-20T05:15:00.000Z', now)).toEqual({
      expired: false,
      minutesLeft: 135,
      label: 'เหลือเวลาตอบอีก 2 ชม. 15 นาที',
    })
  })

  it('เหลือไม่ถึงชั่วโมง = บอกเฉพาะนาที', () => {
    expect(reassignmentCountdown('2026-08-20T03:45:00.000Z', now).label).toBe('เหลือเวลาตอบอีก 45 นาที')
  })

  it('หมดเขตแล้ว = expired (ระบบ auto-resolve ไปแล้ว)', () => {
    expect(reassignmentCountdown('2026-08-20T02:59:00.000Z', now)).toEqual({
      expired: true,
      minutesLeft: 0,
      label: 'หมดเขตตอบแล้ว',
    })
  })

  it('ค่าเวลาที่อ่านไม่ได้ = ถือว่าหมดเขต (ไม่ปล่อยให้กดตอบมั่ว)', () => {
    expect(reassignmentCountdown('ไม่ใช่วันที่', now).expired).toBe(true)
  })
})

describe('trackReassignments — toast เคสที่ถูกโอนเพราะตอบไม่ทัน', () => {
  const withPending = [item({ caseId: 'a', debtorName: 'สมหญิง', hasPendingReassignment: true }), item({ caseId: 'b' })]

  it('รอบแรกจำคำขอที่ค้างไว้ ยังไม่ toast อะไร', () => {
    const result = trackReassignments(withPending, EMPTY_REASSIGNMENT_WATCH)
    expect(result.autoResolved).toEqual([])
    expect(result.next.pending).toEqual({ a: 'สมหญิง' })
  })

  it('คำขอหายไปเองโดยไม่ได้ตอบ = toast ครั้งเดียว', () => {
    const first = trackReassignments(withPending, EMPTY_REASSIGNMENT_WATCH).next
    const second = trackReassignments([item({ caseId: 'b' })], first)
    expect(second.autoResolved).toEqual([{ caseId: 'a', debtorName: 'สมหญิง' }])
    expect(reassignedAwayMessage(second.autoResolved[0]!)).toBe(
      'เคส "สมหญิง" ถูกโอนไปแล้วเพราะไม่ได้ตอบทันเวลา',
    )

    const third = trackReassignments([item({ caseId: 'b' })], second.next)
    expect(third.autoResolved).toEqual([])
  })

  it('ตอบเอง (ยินยอม) แล้วเคสหายไป = ไม่ toast ซ้ำซ้อน', () => {
    const first = trackReassignments(withPending, EMPTY_REASSIGNMENT_WATCH).next
    const answered = { ...first, answered: ['a'] }
    expect(trackReassignments([item({ caseId: 'b' })], answered).autoResolved).toEqual([])
  })

  it('คำขอยังอยู่ = ไม่ toast', () => {
    const first = trackReassignments(withPending, EMPTY_REASSIGNMENT_WATCH).next
    expect(trackReassignments(withPending, first).autoResolved).toEqual([])
  })
})
