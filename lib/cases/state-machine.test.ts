import { describe, expect, it } from 'vitest'
import { CaseError } from '@/lib/cases/errors'
import {
  allowedActionsFrom,
  assertStatusChange,
  bumpsTrackingRound,
  CASE_ACTION_CAPABILITIES,
  CASE_STATUS_ACTIONS,
  CASE_STATUS_RULES,
  caseEventsFor,
  isCaseStatusAction,
  nextStatusOf,
} from '@/lib/cases/state-machine'

/** เทียบกับตาราง §10 + §8 + §12 ของ `docs/38-case-submission.md` (Test Cases §20) */

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof CaseError) return error.code
    throw error
  }
  return 'NO_ERROR'
}

const ok = { hasReason: true }

describe('เส้นทางสถานะตาม `38` §10', () => {
  it('draft → pending_review ด้วย review', () => {
    expect(assertStatusChange('draft', 'review', { hasReason: false })).toBe('pending_review')
  })

  it('pending_review → approved / rejected / need_info', () => {
    expect(assertStatusChange('pending_review', 'accept', { hasReason: false })).toBe('approved')
    expect(assertStatusChange('pending_review', 'reject', ok)).toBe('rejected')
    expect(assertStatusChange('pending_review', 'request_more_info', ok)).toBe('need_info')
  })

  it('need_info กลับไป draft ได้ทางเดียว', () => {
    expect(assertStatusChange('need_info', 'return_to_draft', { hasReason: false })).toBe('draft')
    expect(codeOf(() => assertStatusChange('need_info', 'accept', { hasReason: false }))).toBe(
      'CASE_INVALID_STATUS_TRANSITION',
    )
  })

  it('ข้ามขั้น (accept ตอน draft) ถูกปฏิเสธ', () => {
    expect(codeOf(() => assertStatusChange('draft', 'accept', { hasReason: false }))).toBe(
      'CASE_INVALID_STATUS_TRANSITION',
    )
  })

  it('สถานะปลายทาง (rejected) ทำอะไรต่อไม่ได้', () => {
    for (const action of CASE_STATUS_ACTIONS) {
      expect(allowedActionsFrom('rejected')).not.toContain(action)
    }
  })

  it('allowedActionsFrom ตรงกับตารางกฎ', () => {
    expect(allowedActionsFrom('draft')).toEqual(['review'])
    expect(allowedActionsFrom('pending_review').sort()).toEqual(['accept', 'reject', 'request_more_info'])
    expect(allowedActionsFrom('closed_fail')).toEqual(['create_recycle_request'])
    expect(allowedActionsFrom('pending_recycle_review').sort()).toEqual(['approve_recycle', 'reject_recycle'])
    expect(allowedActionsFrom('closed_success')).toEqual([])
  })
})

describe('เหตุผลบังคับ (`38` §12 · §13)', () => {
  it('ไม่รับเคสโดยไม่กรอกเหตุผล → CASE_STATUS_REASON_REQUIRED', () => {
    expect(codeOf(() => assertStatusChange('pending_review', 'reject', { hasReason: false }))).toBe(
      'CASE_STATUS_REASON_REQUIRED',
    )
  })

  it('ขอข้อมูลเพิ่มโดยไม่กรอกเหตุผล → CASE_STATUS_REASON_REQUIRED', () => {
    expect(codeOf(() => assertStatusChange('pending_review', 'request_more_info', { hasReason: false }))).toBe(
      'CASE_STATUS_REASON_REQUIRED',
    )
  })

  it('เปลี่ยนทีมที่ระบบเสนอโดยไม่ระบุเหตุผล → CASE_STATUS_REASON_REQUIRED', () => {
    expect(
      codeOf(() =>
        assertStatusChange('pending_review', 'accept', { hasReason: false, teamChanged: true }),
      ),
    ).toBe('CASE_STATUS_REASON_REQUIRED')
    expect(
      assertStatusChange('pending_review', 'accept', {
        hasReason: false,
        teamChanged: true,
        hasTeamChangeReason: true,
      }),
    ).toBe('approved')
  })

  it('ยืนยันทีมเดิม (ไม่เปลี่ยน) ไม่ต้องมีเหตุผล', () => {
    expect(assertStatusChange('pending_review', 'accept', { hasReason: false, teamChanged: false })).toBe('approved')
  })
})

describe('Recycle (`38` §6.6 · §20)', () => {
  it('สร้างคำขอจากเคส closed_fail ได้ → pending_recycle_review', () => {
    expect(assertStatusChange('closed_fail', 'create_recycle_request', ok)).toBe('pending_recycle_review')
  })

  it('เคส closed_success ขอรีไซเกิลไม่ได้ → CASE_RECYCLE_INVALID_STATUS', () => {
    expect(codeOf(() => assertStatusChange('closed_success', 'create_recycle_request', ok))).toBe(
      'CASE_RECYCLE_INVALID_STATUS',
    )
  })

  it('สร้างคำขอโดยไม่กรอกหมายเหตุ → CASE_RECYCLE_NOTE_REQUIRED', () => {
    expect(codeOf(() => assertStatusChange('closed_fail', 'create_recycle_request', { hasReason: false }))).toBe(
      'CASE_RECYCLE_NOTE_REQUIRED',
    )
  })

  it('ไม่อนุมัติรีไซเกิลโดยไม่กรอกเหตุผล → CASE_RECYCLE_REJECT_REASON_REQUIRED', () => {
    expect(codeOf(() => assertStatusChange('pending_recycle_review', 'reject_recycle', { hasReason: false }))).toBe(
      'CASE_RECYCLE_REJECT_REASON_REQUIRED',
    )
  })

  it('อนุมัติ → approved (เพิ่มรอบ) · ไม่อนุมัติ → closed_fail เดิม (ไม่เพิ่มรอบ)', () => {
    expect(assertStatusChange('pending_recycle_review', 'approve_recycle', { hasReason: false })).toBe('approved')
    expect(assertStatusChange('pending_recycle_review', 'reject_recycle', ok)).toBe('closed_fail')
    expect(bumpsTrackingRound('approve_recycle')).toBe(true)
    expect(bumpsTrackingRound('reject_recycle')).toBe(false)
    expect(bumpsTrackingRound('accept')).toBe(false)
  })
})

describe('สิทธิ์ต่อ action (`38` §13)', () => {
  it('พิจารณารับ/ไม่รับ/ขอข้อมูลเพิ่ม = เจ้าหน้าที่อนุมัติเคสเท่านั้น', () => {
    for (const action of ['accept', 'reject', 'request_more_info'] as const) {
      expect(CASE_ACTION_CAPABILITIES[action]).toEqual(['approve_case'])
    }
  })

  it('recycle ทั้ง 3 action เป็นของเจ้าหน้าที่อนุมัติเคสคนเดียวกัน', () => {
    for (const action of ['create_recycle_request', 'approve_recycle', 'reject_recycle'] as const) {
      expect(CASE_ACTION_CAPABILITIES[action]).toEqual(['approve_case'])
    }
  })

  it('ส่งตรวจสอบเคส (review) ธุรการทำได้', () => {
    expect(CASE_ACTION_CAPABILITIES.review).toContain('record_admin_data')
  })
})

describe('event ต่อ action (`38` §16 · §17.2)', () => {
  it('ทุก action ยิง case.status_changed เสมอ', () => {
    for (const action of CASE_STATUS_ACTIONS) {
      expect(caseEventsFor(action)).toContain('case.status_changed')
    }
  })

  it('อนุมัติรีไซเกิลยิงทั้ง case.recycle_approved และ case.approved (`38` §16)', () => {
    expect(caseEventsFor('approve_recycle')).toEqual([
      'case.status_changed',
      'case.recycle_approved',
      'case.approved',
    ])
  })

  it('accept/reject/request_more_info ยิง event เฉพาะของตัวเอง', () => {
    expect(caseEventsFor('accept')).toContain('case.approved')
    expect(caseEventsFor('reject')).toContain('case.rejected')
    expect(caseEventsFor('request_more_info')).toContain('case.need_info_requested')
  })
})

describe('ยามความสอดคล้องของตารางกฎ', () => {
  it('ทุก action มีกฎครบและ `to` อยู่ในรายการสถานะจริง', () => {
    for (const action of CASE_STATUS_ACTIONS) {
      const rule = CASE_STATUS_RULES[action]
      expect(rule.from.length).toBeGreaterThan(0)
      expect(nextStatusOf(action)).toBe(rule.to)
      expect(CASE_ACTION_CAPABILITIES[action].length).toBeGreaterThan(0)
    }
  })

  it('มีเพียง review เท่านั้นที่ต้องผ่านความครบถ้วนก่อน (`38` §9)', () => {
    const requiring = CASE_STATUS_ACTIONS.filter((action) => CASE_STATUS_RULES[action].requiresReadiness)
    expect(requiring).toEqual(['review'])
  })

  it('isCaseStatusAction ปฏิเสธชื่อที่ไม่มีในทะเบียน', () => {
    expect(isCaseStatusAction('accept')).toBe(true)
    expect(isCaseStatusAction('force_approve')).toBe(false)
  })
})
