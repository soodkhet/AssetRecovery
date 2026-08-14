import { describe, expect, it } from 'vitest'
import {
  buildMonthGrid,
  countCasesByDate,
  daysInMonth,
  monthLabelTH,
  monthOf,
  shiftMonth,
  toDateIso,
  weekdayIndex,
  withWeekdayPrefix,
} from '@/lib/field/calendar'
import { fmtDate } from '@/lib/format/datetime'
import type { FieldCaseListItemDto } from '@/lib/field/types'

function scheduled(caseId: string, scheduleDate: string | null): FieldCaseListItemDto {
  return {
    caseId,
    assignmentId: `a-${caseId}`,
    caseRef: caseId,
    trackingRound: 1,
    status: 'scheduled',
    group: 'tracking',
    agentId: 'agent-1',
    agentName: 'สมชาย',
    debtorName: null,
    province: null,
    district: null,
    assetDescription: null,
    debtAmountSatang: null,
    assignedAt: '2026-08-01T03:00:00.000Z',
    acceptedAt: null,
    scheduleDate,
    scheduleOrder: 1,
    closedAt: null,
    outcome: null,
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 0,
    commissionSatang: null,
    noSuccessFeeSatang: null,
  }
}

describe('ปฏิทินของ Calendar Picker (`41` §7.4)', () => {
  it('เดือน/ปี ของหัวปฏิทินเป็น พ.ศ. เสมอ (Rule 01)', () => {
    expect(monthLabelTH({ year: 2026, month: 8 })).toBe('สิงหาคม 2569')
    expect(monthLabelTH(monthOf('2026-12-31'))).toBe('ธันวาคม 2569')
  })

  it('เลื่อนเดือนข้ามปีได้ทั้งสองทาง', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 8 }, -14)).toEqual({ year: 2025, month: 6 })
  })

  it('จำนวนวันในเดือนถูกต้องรวมปีอธิกสุรทิน', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 8)).toBe(31)
  })

  it('grid มีช่องว่างต้นสัปดาห์ครบและวันที่ครบทั้งเดือน', () => {
    const cells = buildMonthGrid({ current: { year: 2026, month: 8 }, todayIso: '2026-08-14' })
    const leading = weekdayIndex('2026-08-01')
    expect(cells.slice(0, leading).every((cell) => cell.day === null)).toBe(true)
    expect(cells).toHaveLength(leading + 31)
    expect(cells.at(-1)?.dateIso).toBe('2026-08-31')
  })

  it('วันก่อนวันนี้ถูกมาร์ค isPast (หน้าจอ disable) และวันนี้ถูกมาร์ค isToday', () => {
    const cells = buildMonthGrid({ current: { year: 2026, month: 8 }, todayIso: '2026-08-14' })
    const byDate = new Map(cells.filter((cell) => cell.dateIso !== null).map((cell) => [cell.dateIso, cell]))
    expect(byDate.get('2026-08-13')?.isPast).toBe(true)
    expect(byDate.get('2026-08-14')?.isPast).toBe(false)
    expect(byDate.get('2026-08-14')?.isToday).toBe(true)
    expect(byDate.get('2026-08-15')?.isPast).toBe(false)
  })

  it('badge จำนวนเคสต่อวันมาจากเคสที่จัดวันแล้วเท่านั้น', () => {
    const counts = countCasesByDate([
      scheduled('c1', '2026-08-20'),
      scheduled('c2', '2026-08-20'),
      scheduled('c3', '2026-08-21'),
      scheduled('c4', null),
    ])
    expect(counts).toEqual({ '2026-08-20': 2, '2026-08-21': 1 })

    const cells = buildMonthGrid({
      current: { year: 2026, month: 8 },
      todayIso: '2026-08-14',
      countByDate: counts,
    })
    expect(cells.find((cell) => cell.dateIso === '2026-08-20')?.count).toBe(2)
    expect(cells.find((cell) => cell.dateIso === '2026-08-19')?.count).toBe(0)
  })

  it('ชื่อวันคำนวณจาก UTC (ไม่ขึ้นกับเขตเวลาเครื่อง) และวันที่ยังผ่าน fmtDate เป็น พ.ศ.', () => {
    expect(weekdayIndex('2026-08-14')).toBe(5)
    expect(withWeekdayPrefix('2026-08-14', fmtDate('2026-08-14'))).toBe('วันศ 14/08/2569')
  })

  it('toDateIso เติมศูนย์หน้าเสมอ', () => {
    expect(toDateIso(2026, 1, 5)).toBe('2026-01-05')
  })
})
