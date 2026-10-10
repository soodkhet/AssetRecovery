import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADVANCE_ACTIONS,
  assertAdvanceRejectionReason,
  assertNoUnclearedAdvance,
  assertWithinAdvanceMax,
  canAdvanceAction,
  effectiveAdvanceReturnSatang,
  advanceReopenClearProblem,
  isAdvanceOverdue,
  nextAdvanceStatus,
  resolveApprovedSatang,
  TERMINAL_ADVANCE_STATUSES,
  UNCLEARED_ADVANCE_STATUSES,
  isDueClearDateInPast,
  minDueClearInputDate,
} from '@/lib/advances/advance'
import {
  ADVANCE_NOT_PAID_SETTLE_MESSAGE,
  assertSettleNotInPendingPayout,
  isAdvancePaidOut,
  settlePayoutBlockMessage,
  PENDING_PAYOUT_BATCH_STATUSES,
  pendingPayoutBlockingSettle,
} from '@/lib/advances/advance'
import { AdvanceError } from '@/lib/advances/errors'
import { advanceCreateSchema } from '@/lib/advances/schemas'
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

  it('สถานะ terminal ทำ action ใดไม่ได้เลย — ยกเว้นการเงินตีกลับการเคลียร์ (cleared → approved · staging E-012)', () => {
    for (const status of TERMINAL_ADVANCE_STATUSES) {
      for (const action of ADVANCE_ACTIONS) {
        const allowed = status === 'cleared' && action === 'reopen_clear'
        expect(canAdvanceAction(status, action)).toBe(allowed)
      }
    }
    expect(nextAdvanceStatus('cleared', 'reopen_clear')).toBe('approved')
    expect(canAdvanceAction('rejected', 'reopen_clear')).toBe(false)
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
    // staging S-021 — ข้อความบอกว่ายอดเกิน ไม่ใช่ "สถานะไม่ถูกต้อง"
    expect(() => resolveApprovedSatang(500_000, 600_000)).toThrowError(expect.objectContaining({ userMessage: expect.stringContaining('ไม่เกินยอดที่ขอ (฿5,000.00)') }))
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

describe('มติ PO 03/10/2569 (UAT Q8, BUG-058) — กำหนดเคลียร์ยอดห้ามเป็นวันที่ผ่านมาแล้ว (ปฏิทินไทย)', () => {
  // 03/10/2569 23:30 น. ไทย = 16:30Z · 04/10/2569 00:30 น. ไทย = 03/10 17:30Z (UTC ยังเป็นวันเก่า)
  const lateEvening = new Date('2026-10-03T16:30:00Z')
  const afterMidnightBangkok = new Date('2026-10-03T17:30:00Z')

  it('เมื่อวาน = ผ่านมาแล้ว · วันนี้/พรุ่งนี้ = ได้', () => {
    expect(isDueClearDateInPast('2026-10-02', lateEvening)).toBe(true)
    expect(isDueClearDateInPast('2026-10-03', lateEvening)).toBe(false)
    expect(isDueClearDateInPast('2026-10-04', lateEvening)).toBe(false)
  })

  it('อิงวันไทย ไม่ใช่ UTC — หลังเที่ยงคืนไทย วันที่ 03 กลายเป็นอดีตแล้ว', () => {
    expect(isDueClearDateInPast(new Date('2026-10-03T00:00:00Z'), afterMidnightBangkok)).toBe(true)
    expect(minDueClearInputDate(afterMidnightBangkok)).toBe('2026-10-04')
  })

  describe('advanceCreateSchema (schema เดียวใช้ร่วม FE/BE)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    const payload = (dueClearDate: string) => ({
      requestedSatang: 300_000,
      purpose: 'ไปติดตามทรัพย์ต่างจังหวัด',
      dueClearDate,
    })

    it('วันที่ผ่านมาแล้ว → field error ที่ dueClearDate', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(lateEvening)
      const parsed = advanceCreateSchema.safeParse(payload('2026-10-02'))
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.path).toEqual(['dueClearDate'])
        expect(parsed.error.issues[0]?.message).toContain('วันที่ผ่านมาแล้ว')
      }
    })

    it('วันนี้ (ADV3 ของ UAT) และวันถัดไป → ผ่าน', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(lateEvening)
      expect(advanceCreateSchema.safeParse(payload('2026-10-03')).success).toBe(true)
      expect(advanceCreateSchema.safeParse(payload('2026-10-10')).success).toBe(true)
    })
  })
})

describe('มติ PO U74 — เคลียร์ยอดขณะอยู่ในรอบจ่ายที่ยังไม่โอน', () => {
  const batch = (status: (typeof PENDING_PAYOUT_BATCH_STATUSES)[number] | 'completed' | 'cancelled') => ({
    id: 'pb-1',
    name: 'รอบจ่าย ต.ค. 69 #1',
    status,
  })

  it('ไม่อยู่ในรอบจ่าย (แต่เคยจ่ายแล้ว) → ผ่าน', () => {
    expect(pendingPayoutBlockingSettle(null)).toBeNull()
    expect(() => assertSettleNotInPendingPayout('adv-1', null, true)).not.toThrow()
  })

  it.each(['draft', 'checking', 'file_generated'] as const)('รอบ %s → ADVANCE_IN_PENDING_PAYOUT + ชื่อรอบ', (status) => {
    let caught: unknown = null
    try {
      assertSettleNotInPendingPayout('adv-1', batch(status), false)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AdvanceError)
    const error = caught as AdvanceError
    expect(error.code).toBe('ADVANCE_IN_PENDING_PAYOUT')
    expect(error.status).toBe(400)
    expect(error.userMessage).toContain('รอบจ่าย ต.ค. 69 #1')
    expect(error.context).toMatchObject({ payoutBatchId: 'pb-1', payoutBatchStatus: status })
  })

  it.each(['completed', 'cancelled'] as const)('รอบ %s (เคยจ่ายแล้ว) → ผ่าน', (status) => {
    expect(() => assertSettleNotInPendingPayout('adv-1', batch(status), true)).not.toThrow()
  })
})

describe('มติ PO U83 — เคลียร์ยอดได้เฉพาะเงินทดรองที่จ่ายจริงแล้ว (เคยอยู่ในรอบจ่าย completed)', () => {
  it('จ่ายแล้ว = มีรอบ completed อย่างน้อยหนึ่งรอบ · รอบยกเลิก/ยังไม่โอน/ไม่มีรอบ = ยังไม่จ่าย', () => {
    expect(isAdvancePaidOut([])).toBe(false)
    expect(isAdvancePaidOut([{ status: 'cancelled' }])).toBe(false)
    expect(isAdvancePaidOut([{ status: 'draft' }, { status: 'file_generated' }])).toBe(false)
    expect(isAdvancePaidOut([{ status: 'cancelled' }, { status: 'completed' }])).toBe(true)
  })

  it.each([
    ['ไม่เคยอยู่ในรอบใด', null],
    ['รอบเดิมถูกยกเลิก', { id: 'pb-x', name: 'รอบที่ยกเลิก', status: 'cancelled' as const }],
  ])('%s → ADVANCE_IN_PENDING_PAYOUT ข้อความ "ยังไม่ได้จ่าย…"', (_label, current) => {
    let caught: unknown = null
    try {
      assertSettleNotInPendingPayout('adv-1', current, false)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AdvanceError)
    const error = caught as AdvanceError
    expect(error.code).toBe('ADVANCE_IN_PENDING_PAYOUT')
    expect(error.status).toBe(400)
    expect(error.userMessage).toBe('ยังไม่ได้จ่ายเงินทดรองนี้ — เคลียร์ได้หลังจ่ายแล้ว')
    expect(error.context).toMatchObject({ payoutBatchId: null })
  })

  it('ข้อความเดียวกันทั้งปุ่มและ API · รอบค้างโอนมาก่อน (บอกชื่อรอบ)', () => {
    expect(settlePayoutBlockMessage(null, false)).toBe(ADVANCE_NOT_PAID_SETTLE_MESSAGE)
    expect(settlePayoutBlockMessage(null, true)).toBeNull()
    expect(settlePayoutBlockMessage({ id: 'pb-1', name: 'รอบ A', status: 'checking' }, false)).toContain('รอบ A')
    expect(ADVANCE_NOT_PAID_SETTLE_MESSAGE).not.toMatch(/§|ไฟล์ \d/)
  })
})

describe('effectiveAdvanceReturnSatang (staging E-048)', () => {
  it('ก่อนเคลียร์ยอด (อนุมัติ/เลยกำหนด/รออนุมัติ) ยังไม่มียอดคืน แม้ generated column เท่ายอดอนุมัติ', () => {
    expect(effectiveAdvanceReturnSatang('approved', 250_000)).toBe(0)
    expect(effectiveAdvanceReturnSatang('overdue', 250_000)).toBe(0)
    expect(effectiveAdvanceReturnSatang('pending_approval', 0)).toBe(0)
  })

  it('เคลียร์แล้ว = ยอดคืนจริง', () => {
    expect(effectiveAdvanceReturnSatang('cleared', 32_000)).toBe(32_000)
  })
})

describe('advanceReopenClearProblem (staging E-012)', () => {
  const base = {
    clearReviewedAt: null,
    activeReturnCount: 0,
    activeSubstituteReceiptNumber: null,
    excessClaim: null,
  }
  it('ไม่มีรายการต่อเนื่อง / ส่วนเกินยังรออนุมัติ ⇒ ตีกลับได้', () => {
    expect(advanceReopenClearProblem(base)).toBeNull()
    expect(advanceReopenClearProblem({ ...base, excessClaim: { status: 'pending_approval', inPayout: false } })).toBeNull()
  })
  it('ตรวจแล้ว / มีรับคืน / มีใบรับรองค้าง / ส่วนเกินอนุมัติแล้ว ⇒ บอกเหตุ', () => {
    expect(advanceReopenClearProblem({ ...base, clearReviewedAt: new Date() })).toContain('ตรวจการเคลียร์นี้แล้ว')
    expect(advanceReopenClearProblem({ ...base, activeReturnCount: 1 })).toContain('รับคืน')
    expect(advanceReopenClearProblem({ ...base, activeSubstituteReceiptNumber: 'CRT-2569-0001' })).toContain('CRT-2569-0001')
    expect(advanceReopenClearProblem({ ...base, excessClaim: { status: 'approved', inPayout: false } })).toContain('ส่วนเกิน')
    expect(advanceReopenClearProblem({ ...base, excessClaim: { status: 'pending_approval', inPayout: true } })).toContain('ส่วนเกิน')
  })
})
