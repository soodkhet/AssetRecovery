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
  kanbanProvinceOptions,
  reassignBranchOf,
  reassignmentExpiresAt,
  reassignmentResponseRecipientIds,
  reassignOutcome,
  replacementAgentProblem,
  replacementAgentProblemText,
} from '@/lib/assignments/assignment'
import { FIELD_AGENT_ROLE_NAME } from '@/lib/auth/constants'
import { AssignmentError, REASSIGNMENT_EXPIRED_AWAITING_JOB_MESSAGE } from '@/lib/assignments/errors'

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

  it('error ไม่แนบรหัสทีมของพนักงาน/เคสกลับไป (ไม่ leak ข้อมูลนอกขอบเขต — mytester C-01)', () => {
    try {
      assertAgentInCaseTeam(TEAM_B, TEAM_A)
      throw new Error('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AssignmentError)
      expect(JSON.stringify((error as AssignmentError).context ?? {})).not.toContain(TEAM_B)
      expect(JSON.stringify((error as AssignmentError).context ?? {})).not.toContain(TEAM_A)
    }
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
    // มติ PO 03/10/2569 (UAT Q18 · BUG-042) — สั้นกว่า 5 ตัว = code เดียวกัน (ไม่ใช่ REQUIRED_MISSING)
    expect(codeOf(() => assertReassignReason(' abcd '))).toBe('ASSIGNMENT_REASON_REQUIRED')
    expect(assertReassignReason('abcde')).toBe('abcde')
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

  it('ข้อความ: เลยเวลาแต่ job ยังไม่รัน = "จะเปลี่ยนให้" · job resolve แล้ว = "เปลี่ยนไปแล้ว" (S7-AG5-03)', () => {
    const messageOf = (fn: () => unknown): string => {
      try {
        fn()
      } catch (error) {
        if (error instanceof AssignmentError) return error.userMessage
        throw error
      }
      return 'NO_ERROR'
    }
    const late = messageOf(() => assertRespondable(pending, AGENT, new Date('2026-08-14T06:30:00.000Z')))
    expect(late).toBe(REASSIGNMENT_EXPIRED_AWAITING_JOB_MESSAGE.message)
    expect(late).not.toContain('ไปแล้ว')
    expect(messageOf(() => assertRespondable({ ...pending, resolved: true }, AGENT, beforeExpiry))).toContain(
      'เปลี่ยนผู้รับผิดชอบอัตโนมัติไปแล้ว',
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

describe('ผู้รับผลการตอบคำขอเปลี่ยนผู้รับผิดชอบ (`40` §15 · mytester C-02)', () => {
  const SUP = 'sup'
  const MGR = 'mgr'
  const AGENT = 'agent'
  it('หัวหน้าเป็นผู้ขอ ⇒ ผู้จัดการทีมได้รับด้วย ไม่ซ้ำ', () => {
    expect(reassignmentResponseRecipientIds(SUP, [SUP, MGR], AGENT)).toEqual([SUP, MGR])
  })
  it('ผู้ขอนอกกลุ่มหัวหน้าทีม อยู่ลำดับแรก · ไม่ส่งถึงผู้ตอบเอง', () => {
    expect(reassignmentResponseRecipientIds('requester', [SUP, MGR, AGENT], AGENT)).toEqual(['requester', SUP, MGR])
  })
  it('ทีมไม่มีหัวหน้า/ผู้จัดการ ⇒ ผู้ขอคนเดียว', () => {
    expect(reassignmentResponseRecipientIds(MGR, [], AGENT)).toEqual([MGR])
  })
})

describe('ตัวเลือกกรองจังหวัด Kanban (mytester C-03)', () => {
  it('จังหวัดที่ทีมดูแลก่อน แล้วตามด้วยจังหวัดของเคสที่อยู่นอกพื้นที่ ไม่ซ้ำ ไม่ว่าง', () => {
    expect(
      kanbanProvinceOptions(['นนทบุรี', 'กรุงเทพมหานคร'], ['ชลบุรี', null, 'นนทบุรี', '', 'ชลบุรี', 'ขอนแก่น']),
    ).toEqual(['นนทบุรี', 'กรุงเทพมหานคร', 'ขอนแก่น', 'ชลบุรี'])
  })
  it('ทีมไม่ได้ตั้งจังหวัดและไม่มีเคส ⇒ ว่าง', () => {
    expect(kanbanProvinceOptions([], [])).toEqual([])
  })
})

describe('mytester7 FX1 — ผู้รับงานใหม่ยังรับงานได้ไหม ณ ตอนโอนจริง', () => {
  const TEAM = 'team-a'
  const ok = { status: 'active', deletedAt: null, roleName: FIELD_AGENT_ROLE_NAME, teamId: TEAM }

  it('active · role พนักงาน · ทีมเดียวกับเคส ⇒ ไม่มีปัญหา', () => {
    expect(replacementAgentProblem(ok, TEAM)).toBeNull()
  })
  it('ไม่พบ / ระงับ / ลบ / เปลี่ยน role / ย้ายทีม / เคสไม่มีทีม ⇒ ระบุปัญหา', () => {
    expect(replacementAgentProblem(null, TEAM)).toBe('not_found')
    expect(replacementAgentProblem({ ...ok, status: 'suspended' }, TEAM)).toBe('inactive')
    expect(replacementAgentProblem({ ...ok, status: 'deleted' }, TEAM)).toBe('inactive')
    expect(replacementAgentProblem({ ...ok, deletedAt: new Date() }, TEAM)).toBe('inactive')
    expect(replacementAgentProblem({ ...ok, roleName: 'หัวหน้าทีม' }, TEAM)).toBe('not_field_agent')
    expect(replacementAgentProblem({ ...ok, teamId: 'team-b' }, TEAM)).toBe('team_mismatch')
    expect(replacementAgentProblem({ ...ok, teamId: null }, TEAM)).toBe('team_mismatch')
    expect(replacementAgentProblem(ok, null)).toBe('team_mismatch')
  })
  it('ข้อความเหตุผลบอกว่าเคสยังอยู่กับคนเดิม และไม่มีเลขอ้างอิงสเปค', () => {
    for (const problem of ['not_found', 'inactive', 'not_field_agent', 'team_mismatch'] as const) {
      const text = replacementAgentProblemText(problem)
      expect(text).toContain('เคสยังอยู่กับผู้รับผิดชอบเดิม')
      expect(text).not.toMatch(/§|`\d{2}`/)
    }
  })
})
