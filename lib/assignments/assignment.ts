import type { AssignmentStatus } from '@/lib/generated/prisma/enums'
import { AssignmentError } from '@/lib/assignments/errors'
import { AuthError } from '@/lib/auth/errors'

/**
 * State machine + กติกาการมอบหมายงาน (ไฟล์ 40 §8–§12) — **pure ล้วน**
 * (ห้าม import อะไรที่แตะ Prisma — หน้าจอ 2.7/2.11 เรียกตัว assert ชุดเดียวกับ API)
 *
 * เส้นทางที่ห้ามสลับกันเด็ดขาด (`40` §9):
 * - เคสยัง `assigned` (พนักงานยังไม่กดรับ) → reassign **เปลี่ยนทันที** ไม่ต้องขอความยินยอม
 * - เคส `accepted` แล้ว → reassign **สร้างคำขอ** (`pending_reassignment`) เคสยังเป็นของคนเดิม ทำงานต่อได้ตามปกติ
 *
 * สถานะของ assignment เป็น sub-state ของ `case.status = approved` (ไฟล์ 38) — ไม่ใช่ตัวแทน state ของเคส
 */

/** สถานะของ `case_assignments` ที่ถือว่า "ยังถือเคสอยู่" — นอกนั้นคือสายที่ปิด/ถูกแทนที่ไปแล้ว */
export const ACTIVE_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = ['pending', 'accepted', 'active']

/** สถานะระดับเคสตาม `40` §10 (ready_to_assign → assigned → accepted) */
export type AssignmentState = 'ready_to_assign' | 'assigned' | 'accepted'

export interface AssignmentSnapshot {
  status: AssignmentStatus
  acceptedAt: Date | null
}

/** `assigned` = มอบหมายแล้วรอกดรับ · `accepted` = กดรับแล้ว (รวมสถานะ `active` ที่ไฟล์ 41 ใช้ระหว่างลงพื้นที่) */
export function assignmentStateOf(assignment: AssignmentSnapshot | null): AssignmentState {
  if (assignment === null) return 'ready_to_assign'
  if (!ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status)) return 'ready_to_assign'
  return assignment.status === 'pending' ? 'assigned' : 'accepted'
}

/** `40` §12 — มอบหมายซ้ำโดยไม่ผ่าน reassign ไม่ได้ ไม่ว่าสถานะปัจจุบันจะเป็น assigned หรือ accepted */
export function assertAssignable(state: AssignmentState): void {
  if (state !== 'ready_to_assign') {
    throw new AssignmentError('ASSIGNMENT_ALREADY_EXISTS', { context: { state } })
  }
}

/**
 * `40` §11 — กรองพนักงานตามทีม**ของเคส**เท่านั้น (ไม่ใช่ทีมใดก็ได้ที่ผู้จัดการดูแล)
 * `agentTeamId` ต้องมาจากสมาชิกภาพจริงของพนักงาน (`users.team_id`)
 */
export function assertAgentInCaseTeam(agentTeamId: string | null, caseTeamId: string | null): void {
  if (caseTeamId === null || agentTeamId === null || agentTeamId !== caseTeamId) {
    throw new AssignmentError('ASSIGNMENT_TEAM_MISMATCH', { context: { agentTeamId, caseTeamId } })
  }
}

/** `40` §12 — reassign ต้องมีเหตุผลทุกครั้ง ไม่ว่าจะสถานะไหน */
export function assertReassignReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new AssignmentError('ASSIGNMENT_REASON_REQUIRED')
  return trimmed
}

export type ReassignBranch = 'immediate' | 'request_consent'

/**
 * เลือกสาขาของ reassign ตามสถานะปัจจุบัน (`40` §8/§9) — เคสที่ยังไม่ถูกมอบหมายเปลี่ยนคนไม่ได้
 * (ต้อง assign ก่อน) จึงตอบ `ASSIGNMENT_NOT_FOUND`
 */
export function reassignBranchOf(state: AssignmentState): ReassignBranch {
  if (state === 'ready_to_assign') throw new AssignmentError('ASSIGNMENT_NOT_FOUND')
  return state === 'assigned' ? 'immediate' : 'request_consent'
}

/** `40` §6.1.1 — `expires_at` = เวลาที่ส่งคำขอ + `reassign_timeout_hours` (default 3 ชม.) */
export function reassignmentExpiresAt(requestedAt: Date, timeoutHours: number): Date {
  if (!Number.isFinite(timeoutHours) || timeoutHours <= 0) {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', {
      detail: `reassign_timeout_hours ต้องมากกว่า 0 (ได้ ${timeoutHours})`,
    })
  }
  return new Date(requestedAt.getTime() + timeoutHours * 60 * 60 * 1000)
}

/** หมดเวลาแล้ว = `now` เลย `expires_at` ไปแล้ว (เท่ากับพอดี = ยังไม่หมด) */
export function isReassignmentExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime()
}

export type ReassignmentDecision = 'consent' | 'decline'

export interface RespondInput {
  decision: ReassignmentDecision
  declineReason?: string | null
}

/** `40` §12 — กด "ไม่ยินยอม" ต้องมี `decline_reason` เสมอ */
export function assertDeclineReason(input: RespondInput): string | null {
  if (input.decision !== 'decline') return null
  const trimmed = (input.declineReason ?? '').trim()
  if (trimmed === '') throw new AssignmentError('DECLINE_REASON_REQUIRED')
  return trimmed
}

export interface PendingRespondContext {
  /** พนักงานที่ถือเคสอยู่ (คนที่มีสิทธิ์ตอบคำขอ) */
  fromAgentId: string
  expiresAt: Date
  /** true = คำขอนี้ถูก resolve ไปแล้ว (ยินยอม/ปฏิเสธ/timeout) */
  resolved: boolean
}

/**
 * ตัดสินว่าตอบคำขอได้ไหม (`40` §12) — **จุดที่แข่งกับ timeout job**
 * - คนอื่นที่ไม่ใช่ผู้ถือเคส → `PERMISSION_DENIED` (`40` §12 แถวที่ 5)
 * - คำขอที่ resolve ไปแล้ว หรือเลย `expires_at` → `REASSIGNMENT_ALREADY_TIMED_OUT`
 *   (ยังไม่ทันรัน job แต่เวลาผ่านแล้ว ก็ถือว่าหมดเวลา — ผลลัพธ์เดียวกับที่ job จะทำ)
 */
export function assertRespondable(pending: PendingRespondContext, responderId: string, now: Date): void {
  if (pending.fromAgentId !== responderId) {
    throw new AuthError('PERMISSION_DENIED', 'ผู้ตอบไม่ใช่ผู้ถือเคสปัจจุบัน')
  }
  if (pending.resolved || isReassignmentExpired(pending.expiresAt, now)) {
    throw new AssignmentError('REASSIGNMENT_ALREADY_TIMED_OUT')
  }
}

/** `40` §8 — กดรับงานได้เฉพาะพนักงานที่ถูกมอบหมาย และเฉพาะตอนที่ยังไม่กดรับ */
export function assertAcceptable(assignment: AssignmentSnapshot & { agentId: string }, agentId: string): void {
  if (assignment.agentId !== agentId) {
    throw new AssignmentError('ASSIGNMENT_NOT_FOUND', { detail: 'เคสนี้ไม่ได้มอบหมายให้ผู้ใช้คนนี้' })
  }
  if (assignmentStateOf(assignment) !== 'assigned') {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', { context: { status: assignment.status } })
  }
}

export interface ReassignOutcome {
  /** สถานะของ assignment เดิมหลังเปลี่ยนสำเร็จ */
  previousStatus: AssignmentStatus
  /** assignment ใหม่เริ่มที่ `pending` เสมอ + `accepted_at` = null (`40` §11 — ต้องกดรับใหม่) */
  nextStatus: AssignmentStatus
  acceptedAt: null
}

/**
 * `40` §11 — reassign สำเร็จ (ยินยอมหรือ timeout ก็ตาม) รีเซ็ตกลับเป็น `assigned` และล้าง `accepted_at` **เสมอ**
 * ผลลัพธ์ของฟังก์ชันนี้คือค่าที่ต้องเขียนลง DB — ห้ามคำนวณเองซ้ำในชั้น query
 */
export function reassignOutcome(): ReassignOutcome {
  return { previousStatus: 'reassigned', nextStatus: 'pending', acceptedAt: null }
}
