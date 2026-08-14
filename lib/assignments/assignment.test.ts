import { describe, expect, it } from 'vitest'
import {
  assertAcceptable,
  assertAgentInCaseTeam,
  assertAssignable,
  assertDeclineReason,
  assertReassignReason,
  assertRespondable,
  assignmentStateOf,
  isReassignmentExpired,
  reassignBranchOf,
  reassignmentExpiresAt,
  reassignOutcome,
} from '@/lib/assignments/assignment'

/** เทสต์ตาม `40` §20 (Test Cases) — โฟกัสกฎที่ห้ามสลับกันของ reassign 2 สาขา */

function codeOf(run: () => unknown): string {
  try {
    run()
    return 'NO_ERROR'
  } catch (error) {
    return (error as { code?: string }).code ?? 'UNKNOWN'
  }
}

const TEAM_A = '00000000-0000-4000-8000-00000000aaaa'
const TEAM_B = '00000000-0000-4000-8000-00000000bbbb'
const AGENT = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'

describe('assignmentStateOf (`40` §10)', () => {
  it('ไม่มี assignment = ready_to_assign', () => {
    expect(assignmentStateOf(null)).toBe('ready_to_assign')
  })

  it('pending_accept = assigned (รอกดรับ) · accepted_unscheduled/scheduled/needs_revision = accepted', () => {
    expect(assignmentStateOf({ status: 'pending_accept', acceptedAt: null })).toBe('assigned')
    expect(assignmentStateOf({ status: 'accepted_unscheduled', acceptedAt: new Date() })).toBe('accepted')
    expect(assignmentStateOf({ status: 'scheduled', acceptedAt: new Date() })).toBe('accepted')
    expect(assignmentStateOf({ status: 'needs_revision', acceptedAt: new Date() })).toBe('accepted')
  })

  it('สายที่ปิด/ถูกแทนที่แล้วไม่นับว่าถือเคสอยู่', () => {
    for (const status of ['reassigned_away', 'closed_success', 'closed_fail'] as const) {
      expect(assignmentStateOf({ status, acceptedAt: null })).toBe('ready_to_assign')
    }
  })
})

describe('assign (`40` §12)', () => {
  it('มอบหมายซ้ำโดยไม่ผ่าน reassign = ASSIGNMENT_ALREADY_EXISTS', () => {
    expect(codeOf(() => assertAssignable('ready_to_assign'))).toBe('NO_ERROR')
    expect(codeOf(() => assertAssignable('assigned'))).toBe('ASSIGNMENT_ALREADY_EXISTS')
    expect(codeOf(() => assertAssignable('accepted'))).toBe('ASSIGNMENT_ALREADY_EXISTS')
  })

  it('พนักงานนอกทีมของเคส = ASSIGNMENT_TEAM_MISMATCH (แม้ผู้จัดการจะดูแลทีมนั้นด้วย)', () => {
    expect(codeOf(() => assertAgentInCaseTeam(TEAM_A, TEAM_A))).toBe('NO_ERROR')
    expect(codeOf(() => assertAgentInCaseTeam(TEAM_B, TEAM_A))).toBe('ASSIGNMENT_TEAM_MISMATCH')
    expect(codeOf(() => assertAgentInCaseTeam(null, TEAM_A))).toBe('ASSIGNMENT_TEAM_MISMATCH')
    expect(codeOf(() => assertAgentInCaseTeam(TEAM_A, null))).toBe('ASSIGNMENT_TEAM_MISMATCH')
  })
})

describe('reassign 2 สาขา (`40` §8/§9)', () => {
  it('ยังไม่ accepted = เปลี่ยนทันที · accepted แล้ว = ต้องขอความยินยอม', () => {
    expect(reassignBranchOf('assigned')).toBe('immediate')
    expect(reassignBranchOf('accepted')).toBe('request_consent')
  })

  it('เคสที่ยังไม่มีการมอบหมาย reassign ไม่ได้', () => {
    expect(codeOf(() => reassignBranchOf('ready_to_assign'))).toBe('ASSIGNMENT_NOT_FOUND')
  })

  it('ไม่กรอกเหตุผล = ASSIGNMENT_REASON_REQUIRED (ทั้งสองสาขา)', () => {
    expect(assertReassignReason('  ย้ายพื้นที่รับผิดชอบ  ')).toBe('ย้ายพื้นที่รับผิดชอบ')
    expect(codeOf(() => assertReassignReason('   '))).toBe('ASSIGNMENT_REASON_REQUIRED')
    expect(codeOf(() => assertReassignReason(null))).toBe('ASSIGNMENT_REASON_REQUIRED')
  })

  it('reassign สำเร็จรีเซ็ตกลับ assigned + ล้าง accepted_at เสมอ (`40` §11)', () => {
    expect(reassignOutcome()).toEqual({
      previousStatus: 'reassigned_away',
      nextStatus: 'pending_accept',
      acceptedAt: null,
    })
  })
})

describe('expires_at + timeout (`40` §6.1.1 · §12)', () => {
  const requestedAt = new Date('2026-08-14T03:00:00.000Z')

  it('expires_at = requested_at + reassign_timeout_hours (default 3 ชม.)', () => {
    expect(reassignmentExpiresAt(requestedAt, 3).toISOString()).toBe('2026-08-14T06:00:00.000Z')
    expect(reassignmentExpiresAt(requestedAt, 1).toISOString()).toBe('2026-08-14T04:00:00.000Z')
  })

  it('ค่า timeout ที่ไม่ใช่จำนวนบวก = ข้อมูลตั้งค่าเพี้ยน ต้องไม่เงียบ', () => {
    expect(codeOf(() => reassignmentExpiresAt(requestedAt, 0))).toBe('ASSIGNMENT_INVALID_STATUS')
    expect(codeOf(() => reassignmentExpiresAt(requestedAt, -3))).toBe('ASSIGNMENT_INVALID_STATUS')
  })

  it('ครบเวลาพอดียังไม่ถือว่าหมดเวลา — เกินไปแล้วถึงหมด', () => {
    const expiresAt = new Date('2026-08-14T06:00:00.000Z')
    expect(isReassignmentExpired(expiresAt, new Date('2026-08-14T06:00:00.000Z'))).toBe(false)
    expect(isReassignmentExpired(expiresAt, new Date('2026-08-14T06:00:00.001Z'))).toBe(true)
  })
})

describe('respond_reassignment_consent (`40` §12)', () => {
  const expiresAt = new Date('2026-08-14T06:00:00.000Z')
  const pending = { fromAgentId: AGENT, expiresAt, resolved: false }
  const beforeExpiry = new Date('2026-08-14T05:59:00.000Z')

  it('ผู้ถือเคสตอบก่อนหมดเวลาได้', () => {
    expect(codeOf(() => assertRespondable(pending, AGENT, beforeExpiry))).toBe('NO_ERROR')
  })

  it('คนอื่นตอบแทนไม่ได้ = PERMISSION_DENIED', () => {
    expect(codeOf(() => assertRespondable(pending, OTHER, beforeExpiry))).toBe('PERMISSION_DENIED')
  })

  it('ตอบหลังหมดเวลา = REASSIGNMENT_ALREADY_TIMED_OUT (job ยังไม่ทันรันก็ตาม)', () => {
    expect(codeOf(() => assertRespondable(pending, AGENT, new Date('2026-08-14T06:30:00.000Z')))).toBe(
      'REASSIGNMENT_ALREADY_TIMED_OUT',
    )
  })

  it('คำขอที่ job resolve ไปแล้ว ตอบไม่ได้แม้ยังไม่ถึง expires_at', () => {
    expect(codeOf(() => assertRespondable({ ...pending, resolved: true }, AGENT, beforeExpiry))).toBe(
      'REASSIGNMENT_ALREADY_TIMED_OUT',
    )
  })

  it('ไม่ยินยอมต้องมี decline_reason', () => {
    expect(assertDeclineReason({ decision: 'consent' })).toBeNull()
    expect(assertDeclineReason({ decision: 'decline', declineReason: ' ติดงานอยู่ ' })).toBe('ติดงานอยู่')
    expect(codeOf(() => assertDeclineReason({ decision: 'decline', declineReason: '  ' }))).toBe(
      'DECLINE_REASON_REQUIRED',
    )
    expect(codeOf(() => assertDeclineReason({ decision: 'decline' }))).toBe('DECLINE_REASON_REQUIRED')
  })
})

describe('accept_assignment (`40` §8)', () => {
  it('กดรับได้เฉพาะเคสของตัวเองที่ยังไม่กดรับ', () => {
    const assignment = { agentId: AGENT, status: 'pending_accept' as const, acceptedAt: null }
    expect(codeOf(() => assertAcceptable(assignment, AGENT))).toBe('NO_ERROR')
    expect(codeOf(() => assertAcceptable(assignment, OTHER))).toBe('ASSIGNMENT_NOT_FOUND')
    expect(
      codeOf(() => assertAcceptable({ agentId: AGENT, status: 'accepted_unscheduled', acceptedAt: new Date() }, AGENT)),
    ).toBe('ASSIGNMENT_INVALID_STATUS')
  })
})
