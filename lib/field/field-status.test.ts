import { describe, expect, it } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import {
  assertFieldAction,
  assertFieldStateAction,
  closedStatusOf,
  FIELD_STATUSES,
  fieldGroupOf,
  isFieldGroup,
  statusesInGroup,
} from '@/lib/field/field-status'

/** คืน code ของ error ที่โยนออกมา (ไม่โยน = NO_ERROR) เพื่อเทียบกับ `41` §12 ตรง ๆ */
function codeOf(fn: () => void): string {
  try {
    fn()
    return 'NO_ERROR'
  } catch (error) {
    return error instanceof ModuleError ? error.code : 'UNKNOWN'
  }
}

describe('field state machine (`41` §10)', () => {
  it('มีครบ 7 สถานะตาม §10 ไม่ขาดไม่เกิน', () => {
    expect([...FIELD_STATUSES]).toEqual([
      'pending_accept',
      'accepted_unscheduled',
      'scheduled',
      'closed_success',
      'closed_fail',
      'needs_revision',
      'reassigned_away',
    ])
  })

  it('เส้นทางหลัก: รับงาน → จัดวัน → ปิดงาน', () => {
    expect(codeOf(() => assertFieldAction('pending_accept', 'accept_case'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldAction('accepted_unscheduled', 'schedule_case'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldAction('scheduled', 'submit_close_case'))).toBe('NO_ERROR')
  })

  it('ข้ามขั้นไม่ได้ — จัดวันก่อนกดรับ / ปิดงานก่อนจัดวัน', () => {
    expect(codeOf(() => assertFieldAction('pending_accept', 'schedule_case'))).toBe('ASSIGNMENT_INVALID_STATUS')
    expect(codeOf(() => assertFieldAction('accepted_unscheduled', 'submit_close_case'))).toBe(
      'ASSIGNMENT_INVALID_STATUS',
    )
    expect(codeOf(() => assertFieldAction('pending_accept', 'accept_case'))).toBe('NO_ERROR')
  })

  it('รับงานซ้ำ / ปิดงานซ้ำไม่ได้', () => {
    expect(codeOf(() => assertFieldAction('accepted_unscheduled', 'accept_case'))).toBe('ASSIGNMENT_INVALID_STATUS')
    expect(codeOf(() => assertFieldAction('closed_success', 'submit_close_case'))).toBe('ASSIGNMENT_INVALID_STATUS')
  })

  it('เคสที่ถูกโอนไปแล้วทำอะไรต่อไม่ได้เลย (terminal ของพนักงานคนเดิม)', () => {
    for (const action of ['accept_case', 'schedule_case', 'submit_close_case'] as const) {
      expect(codeOf(() => assertFieldAction('reassigned_away', action))).toBe('ASSIGNMENT_INVALID_STATUS')
    }
  })

  it('ตีกลับหลักฐานได้จากเคสที่ปิดแล้วเท่านั้น แล้ว resubmit ได้จาก needs_revision เท่านั้น (§10.1)', () => {
    expect(codeOf(() => assertFieldAction('closed_success', 'reject_evidence'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldAction('closed_fail', 'reject_evidence'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldAction('scheduled', 'reject_evidence'))).toBe('ASSIGNMENT_INVALID_STATUS')
    expect(codeOf(() => assertFieldAction('needs_revision', 'resubmit_close_case'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldAction('closed_success', 'resubmit_close_case'))).toBe('ASSIGNMENT_INVALID_STATUS')
  })

  it('เช็คอิน/draft/ลากสลับลำดับ ทำได้เฉพาะเคสที่จัดวันแล้ว', () => {
    expect(codeOf(() => assertFieldStateAction('scheduled', 'add_checkin'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldStateAction('scheduled', 'save_close_draft'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldStateAction('scheduled', 'reorder_schedule'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldStateAction('accepted_unscheduled', 'add_checkin'))).toBe(
      'ASSIGNMENT_INVALID_STATUS',
    )
    expect(codeOf(() => assertFieldStateAction('needs_revision', 'add_checkin'))).toBe('ASSIGNMENT_INVALID_STATUS')
  })

  it('จุดเริ่มเดินทางปรับได้ทั้งตอนทำงานปกติและตอนแก้หลักฐาน (§10.1 — ไม่ใช่หลักฐาน)', () => {
    expect(codeOf(() => assertFieldStateAction('scheduled', 'set_travel_origin'))).toBe('NO_ERROR')
    expect(codeOf(() => assertFieldStateAction('needs_revision', 'set_travel_origin'))).toBe('NO_ERROR')
  })

  it('ปลายทางของการปิดงานมาจาก outcome ที่เลือก', () => {
    expect(closedStatusOf('closed_success')).toBe('closed_success')
    expect(closedStatusOf('closed_fail')).toBe('closed_fail')
  })
})

describe('4 กลุ่มของแท็บงาน (`41` §7.2/§7.3/§7.5/§7.11)', () => {
  it('จับกลุ่มตามแท็บที่ผู้ใช้เห็น', () => {
    expect(fieldGroupOf('pending_accept')).toBe('pending_accept')
    expect(fieldGroupOf('accepted_unscheduled')).toBe('accepted')
    expect(fieldGroupOf('scheduled')).toBe('tracking')
    expect(fieldGroupOf('closed_success')).toBe('closed')
    expect(fieldGroupOf('closed_fail')).toBe('closed')
    expect(fieldGroupOf('reassigned_away')).toBe('closed')
  })

  it('เคสที่ถูกตีกลับหลักฐานยังเป็นงานค้าง — อยู่แท็บกำลังติดตาม ไม่ใช่จบงาน', () => {
    expect(fieldGroupOf('needs_revision')).toBe('tracking')
    expect(statusesInGroup('tracking')).toEqual(['scheduled', 'needs_revision'])
  })

  it('ทุกสถานะต้องมีกลุ่ม และรวมกันแล้วครบทุกสถานะ', () => {
    const all = (['pending_accept', 'accepted', 'tracking', 'closed'] as const).flatMap(statusesInGroup)
    expect(all.sort()).toEqual([...FIELD_STATUSES].sort())
  })

  it('รับเฉพาะชื่อกลุ่มที่รู้จัก', () => {
    expect(isFieldGroup('tracking')).toBe(true)
    expect(isFieldGroup('scheduled')).toBe(false)
  })
})
