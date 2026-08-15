import { describe, expect, it } from 'vitest'
import {
  ADVANCE_ACTIONS,
  assertAdvanceRejectionReason,
  assertNoUnclearedAdvance,
  assertWithinAdvanceMax,
  canAdvanceAction,
  isAdvanceOverdue,
  nextAdvanceStatus,
  resolveApprovedSatang,
  TERMINAL_ADVANCE_STATUSES,
  UNCLEARED_ADVANCE_STATUSES,
} from '@/lib/advances/advance'
import { AdvanceError } from '@/lib/advances/errors'
import type { AdvanceStatus } from '@/lib/generated/prisma/enums'

/** `15` §16 + `23` §6.4 — เทสต์ตามเคสที่เอกสารระบุชื่อไว้ตรง ๆ */

describe('state machine ของเงินทดรอง (`23` §6.4)', () => {
  it('เดินตามเส้นทางที่เอกสารกำหนดครบทุกเส้น', () => {
    expect(nextAdvanceStatus('pending_approval', 'approve')).toBe('approved')
    expect(nextAdvanceStatus('pending_approval', 'reject')).toBe('rejected')
    expect(nextAdvanceStatus('approved', 'mark_overdue')).toBe('overdue')
    expect(nextAdvanceStatus('approved', 'settle')).toBe('cleared')
    expect(nextAdvanceStatus('overdue', 'settle')).toBe('cleared')
  })

  it('เคลียร์ยอดได้ทั้งจาก approved และ overdue (`15` §9.1)', () => {
    expect(canAdvanceAction('approved', 'settle')).toBe(true)
    expect(canAdvanceAction('overdue', 'settle')).toBe(true)
  })

  it('overdue มาจาก approved เท่านั้น — ไม่มีเส้นทางอื่น (`15` §10 job เท่านั้น)', () => {
    for (const status of ['pending_approval', 'overdue', 'cleared', 'rejected'] as AdvanceStatus[]) {
      expect(canAdvanceAction(status, 'mark_overdue')).toBe(false)
    }
  })

  it('สถานะ terminal ทำ action ใดไม่ได้เลย', () => {
    for (const status of TERMINAL_ADVANCE_STATUSES) {
      for (const action of ADVANCE_ACTIONS) {
        expect(canAdvanceAction(status, action)).toBe(false)
      }
    }
  })

  it('action ที่สถานะทำไม่ได้ = ADVANCE_INVALID_STATUS', () => {
    expect(() => nextAdvanceStatus('cleared', 'approve')).toThrowError(AdvanceError)
    try {
      nextAdvanceStatus('cleared', 'approve')
    } catch (error) {
      expect((error as AdvanceError).code).toBe('ADVANCE_INVALID_STATUS')
    }
  })
})

describe('ห้ามเบิกซ้อน (`15` §9.2 · §16)', () => {
  it('approved และ overdue บล็อกเหมือนกันทั้งคู่', () => {
    expect([...UNCLEARED_ADVANCE_STATUSES].sort()).toEqual(['approved', 'overdue'])
  })

  it('มียอด approved ค้าง → ADVANCE_PENDING_SETTLEMENT', () => {
    try {
      assertNoUnclearedAdvance({ id: 'adv-1', status: 'approved' })
      throw new Error('ควรถูกปฏิเสธ')
    } catch (error) {
      expect(error).toBeInstanceOf(AdvanceError)
      expect((error as AdvanceError).code).toBe('ADVANCE_PENDING_SETTLEMENT')
      expect((error as AdvanceError).context).toMatchObject({ advanceId: 'adv-1', status: 'approved' })
    }
  })

  it('มียอด overdue ค้าง → ADVANCE_PENDING_SETTLEMENT เหมือนกัน', () => {
    expect(() => assertNoUnclearedAdvance({ id: 'adv-2', status: 'overdue' })).toThrowError(AdvanceError)
  })

  it('ไม่มียอดค้าง → ผ่าน', () => {
    expect(() => assertNoUnclearedAdvance(null)).not.toThrow()
  })
})

describe('เพดานยอดต่อครั้ง (`15` §11 ADVANCE_EXCEEDS_MAX)', () => {
  it('null = ไม่จำกัด ไม่ตรวจเลย', () => {
    expect(() => assertWithinAdvanceMax(999_999_00, null)).not.toThrow()
  })

  it('เท่ากับเพดานพอดี = ผ่าน', () => {
    expect(() => assertWithinAdvanceMax(500_000, 500_000)).not.toThrow()
  })

  it('เกินเพดาน = ปฏิเสธ', () => {
    try {
      assertWithinAdvanceMax(500_001, 500_000)
      throw new Error('ควรถูกปฏิเสธ')
    } catch (error) {
      expect((error as AdvanceError).code).toBe('ADVANCE_EXCEEDS_MAX')
    }
  })
})

describe('เหตุผลตอนปฏิเสธ (`15` §16 REJECTION_REASON_REQUIRED)', () => {
  it('ว่าง/สั้นเกินไป = ปฏิเสธ', () => {
    for (const reason of [null, undefined, '', '   ', 'สั้น']) {
      try {
        assertAdvanceRejectionReason(reason)
        throw new Error('ควรถูกปฏิเสธ')
      } catch (error) {
        expect((error as AdvanceError).code).toBe('REJECTION_REASON_REQUIRED')
      }
    }
  })

  it('เหตุผลที่ใช้ได้ถูก trim ให้', () => {
    expect(assertAdvanceRejectionReason('  เอกสารไม่ครบถ้วน  ')).toBe('เอกสารไม่ครบถ้วน')
  })
})

describe('ยอดที่อนุมัติ (`02` §5 แยก approved ออกจาก requested)', () => {
  it('ไม่ระบุ = อนุมัติเต็มจำนวนที่ขอ', () => {
    expect(resolveApprovedSatang(500_000, null)).toBe(500_000)
    expect(resolveApprovedSatang(500_000, undefined)).toBe(500_000)
  })

  it('ปรับลดได้', () => {
    expect(resolveApprovedSatang(500_000, 400_000)).toBe(400_000)
  })

  it('อนุมัติเกินยอดที่ขอไม่ได้', () => {
    expect(() => resolveApprovedSatang(500_000, 600_000)).toThrowError(AdvanceError)
  })
})

describe('เลยกำหนดเคลียร์ยอด — เทียบวันตามปฏิทินไทย (Rule 01)', () => {
  // 15/08/2569 07:00 ไทย = 2026-08-15T00:00:00Z
  const now = new Date('2026-08-15T00:00:00Z')

  it('กำหนดวันนี้ = ยังไม่เลย', () => {
    expect(isAdvanceOverdue(new Date('2026-08-15T00:00:00Z'), now)).toBe(false)
  })

  it('กำหนดเมื่อวาน = เลยแล้ว', () => {
    expect(isAdvanceOverdue(new Date('2026-08-14T00:00:00Z'), now)).toBe(true)
  })

  it('กำหนดพรุ่งนี้ = ยังไม่เลย', () => {
    expect(isAdvanceOverdue(new Date('2026-08-16T00:00:00Z'), now)).toBe(false)
  })

  it('เวลา UTC ก่อนเที่ยงคืนไทยยังนับเป็นวันไทยถัดไปแล้ว', () => {
    // 2026-08-15T18:00:00Z = 16/08/2569 01:00 น. ไทย ⇒ กำหนด 15/08 ถือว่าเลยแล้ว
    expect(isAdvanceOverdue('2026-08-15', new Date('2026-08-15T18:00:00Z'))).toBe(true)
  })
})
