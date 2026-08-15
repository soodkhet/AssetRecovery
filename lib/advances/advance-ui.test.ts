import { describe, expect, it } from 'vitest'
import {
  ADVANCE_STATUS_LABEL,
  advanceStatusBadgeGroup,
  advanceStatusLabel,
  canReviewAdvance,
  canSettleAdvance,
  countAwaitingSettlement,
  countOverdue,
  ADVANCE_STATUS_FILTERS,
  outstandingAdvanceSatang,
} from '@/lib/advances/advance-ui'
import type { AdvanceDto } from '@/lib/advances/types'
import type { AdvanceStatus } from '@/lib/generated/prisma/enums'

/**
 * ป้าย/สี/ปุ่มของหน้าจอเงินทดรองจ่าย (`15` §8) — โมดูล pure ที่หน้าจอเรียกแทนการ if สถานะเอง
 * ยามสำคัญที่นี่: **`overdue` ต้องแดงแยกจาก `approved`** และ **ปุ่มต้องตรง state machine `23` §6.4**
 */

const ALL_STATUSES: readonly AdvanceStatus[] = [
  'pending_approval',
  'approved',
  'overdue',
  'cleared',
  'rejected',
]

function advance(overrides: Partial<AdvanceDto> = {}): AdvanceDto {
  return {
    id: 'adv-1',
    payeeId: 'payee-1',
    payeeName: 'วิชัย ขยันดี',
    teamName: 'ทีม A',
    requestedSatang: 300_000,
    approvedSatang: 300_000,
    usedSatang: 0,
    returnSatang: 300_000,
    excessSatang: 0,
    status: 'approved',
    purpose: 'สำรองค่าเดินทางภาคเหนือ',
    dueClearDate: '2026-06-28',
    isPastDue: false,
    approvedByName: 'สมศรี การเงิน',
    approvedAt: '2026-06-20T03:00:00.000Z',
    clearedAt: null,
    rejectionReason: null,
    createdAt: '2026-06-18T03:00:00.000Z',
    requesterName: 'วิชัย ขยันดี',
    ...overrides,
  }
}

describe('ป้ายสถานะเงินทดรองจ่าย', () => {
  it('มีข้อความครบทั้ง 5 สถานะของ `23` §6.4 — ไม่มีสถานะไหนหลุดเป็นค่าว่าง', () => {
    for (const status of ALL_STATUSES) {
      expect(advanceStatusLabel(status)).toBeTruthy()
    }
    expect(Object.keys(ADVANCE_STATUS_LABEL)).toHaveLength(ALL_STATUSES.length)
  })

  it('`approved` สื่อว่ายังต้องเคลียร์ยอด — ไม่ใช่จบงาน (`15` §17)', () => {
    expect(advanceStatusLabel('approved')).toContain('เคลียร์')
  })

  it('`overdue` = กลุ่ม critical (แดง) แยกจาก `approved` เด็ดขาด (`15` §8)', () => {
    expect(advanceStatusBadgeGroup('overdue')).toBe('critical')
    expect(advanceStatusBadgeGroup('overdue')).not.toBe(advanceStatusBadgeGroup('approved'))
  })

  it('`cleared` ไม่ใช้สีเตือน — งานจบแล้ว', () => {
    expect(advanceStatusBadgeGroup('cleared')).toBe('cleared')
  })
})

describe('ปุ่มบนแถว — ต้องตรง state machine เดียวกับ API', () => {
  it('อนุมัติ/ปฏิเสธได้เฉพาะรายการที่ยังรออนุมัติ', () => {
    expect(canReviewAdvance('pending_approval')).toBe(true)
    for (const status of ALL_STATUSES.filter((item) => item !== 'pending_approval')) {
      expect(canReviewAdvance(status)).toBe(false)
    }
  })

  it('เคลียร์ยอดได้ทั้ง `approved` และ `overdue` (`15` §9.1) — เลยกำหนดแล้วยังต้องเคลียร์ได้', () => {
    expect(canSettleAdvance('approved')).toBe(true)
    expect(canSettleAdvance('overdue')).toBe(true)
  })

  it('เคลียร์ยอดซ้ำไม่ได้ และรายการที่ยังไม่อนุมัติ/ถูกปฏิเสธก็เคลียร์ไม่ได้', () => {
    expect(canSettleAdvance('cleared')).toBe(false)
    expect(canSettleAdvance('pending_approval')).toBe(false)
    expect(canSettleAdvance('rejected')).toBe(false)
  })
})

describe('ตัวนับบนหัวตาราง', () => {
  it('นับที่ยังไม่เคลียร์ = `approved` + `overdue` เท่านั้น (ตรงกับกติกาห้ามเบิกซ้อน `15` §9.2)', () => {
    const items = [
      advance({ id: 'a', status: 'approved' }),
      advance({ id: 'b', status: 'overdue' }),
      advance({ id: 'c', status: 'cleared' }),
      advance({ id: 'd', status: 'pending_approval' }),
      advance({ id: 'e', status: 'rejected' }),
    ]
    expect(countAwaitingSettlement(items)).toBe(2)
  })

  it('นับ overdue แยกต่างหาก — ใช้ขึ้นแถบเตือนสีแดง', () => {
    const items = [
      advance({ id: 'a', status: 'overdue' }),
      advance({ id: 'b', status: 'overdue' }),
      advance({ id: 'c', status: 'approved' }),
    ]
    expect(countOverdue(items)).toBe(2)
  })

  it('ไม่มีรายการ = 0 ทั้งคู่ (หน้าจอต้องไม่ขึ้นแถบเตือน)', () => {
    expect(countAwaitingSettlement([])).toBe(0)
    expect(countOverdue([])).toBe(0)
  })

  it('`approved` ที่เพิ่งเลยกำหนดแต่ job ยังไม่มาร์ค ยังไม่นับเป็น overdue — สถานะจริงมาจาก job เท่านั้น (`15` §10)', () => {
    const items = [advance({ status: 'approved', isPastDue: true })]
    expect(countOverdue(items)).toBe(0)
    expect(countAwaitingSettlement(items)).toBe(1)
  })
})

describe('ยอดค้าง + ตัวกรองของแท็บเต็ม (`15` §8 — Phase 3.4)', () => {
  it('ยอดค้าง = ยอดที่อนุมัติของรายการที่ยังไม่เคลียร์เท่านั้น', () => {
    const items = [
      advance({ id: 'a', status: 'approved', approvedSatang: 500_000 }),
      advance({ id: 'b', status: 'overdue', approvedSatang: 200_000 }),
      // ยังไม่อนุมัติ = เงินยังไม่ออก · เคลียร์แล้ว = คืนของแล้ว ⇒ ไม่นับทั้งคู่
      advance({ id: 'c', status: 'pending_approval', approvedSatang: null }),
      advance({ id: 'd', status: 'cleared', approvedSatang: 900_000 }),
    ]
    expect(outstandingAdvanceSatang(items)).toBe(700_000)
  })

  it('ไม่มีรายการค้าง = 0 (หน้าจอไม่ขึ้นแถบเตือน)', () => {
    expect(outstandingAdvanceSatang([])).toBe(0)
  })

  it('ตัวกรองทุกตัวต้องเป็นค่าที่ `GET /api/advances` รับได้จริง', () => {
    expect(ADVANCE_STATUS_FILTERS.map((item) => item.value)).toEqual([
      'all',
      'pending_approval',
      'uncleared',
      'overdue',
      'cleared',
      'rejected',
    ])
  })
})
