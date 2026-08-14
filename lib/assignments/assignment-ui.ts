import { reassignBranchOf, type AssignmentState } from '@/lib/assignments/assignment'
import type { AssignmentTeamSide } from '@/lib/assignments/types'
import { fmtDateTime } from '@/lib/format/datetime'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ข้อความ/สี/ปุ่มของหน้ามอบหมายงาน (`40` §7.2/§7.3/§7.5) — **pure ล้วน** (ห้ามแตะ Prisma/DOM)
 *
 * กติกาที่ผูกไว้ที่นี่ที่เดียว (หน้าจอห้าม if สถานะเอง — Rule 04):
 * - ปุ่ม assign/reassign ของ**หัวหน้าทีม**เมื่อ settings ปิด = **ซ่อน ไม่ใช่ disabled** (`40` §7.2 · Rule 05)
 * - สาขาของ reassign มาจาก `reassignBranchOf()` ตัวเดียวกับฝั่ง API (`assigned` = เปลี่ยนทันที ·
 *   `accepted` = ส่งคำขอรอความยินยอม) ⇒ คำบนปุ่มและคำเตือนต้องสลับตามสาขานั้นเสมอ (`40` §7.3)
 * - วันเวลาบนรายการใช้ `fmtDateTime` (พ.ศ. · Asia/Bangkok) ห้าม format เองเฉพาะโมดูลนี้ (`40` §7.2)
 */

export const ASSIGNMENT_STATE_LABEL: Readonly<Record<AssignmentState, string>> = {
  ready_to_assign: 'พร้อมมอบหมาย',
  assigned: 'มอบหมายแล้ว (รอรับ)',
  accepted: 'รับงานแล้ว',
}

const ASSIGNMENT_STATE_GROUP: Readonly<Record<AssignmentState, StatusBadgeGroup>> = {
  ready_to_assign: 'pending',
  assigned: 'sent',
  accepted: 'success',
}

export function assignmentStateLabel(state: AssignmentState): string {
  return ASSIGNMENT_STATE_LABEL[state]
}

export function assignmentStateBadgeGroup(state: AssignmentState): StatusBadgeGroup {
  return ASSIGNMENT_STATE_GROUP[state]
}

/** badge แยกจากสถานะหลัก — เคสยังเป็น `accepted` ปกติแต่มีคำขอค้างอยู่ (`40` §7.2) */
export const PENDING_REASSIGNMENT_LABEL = 'รอความยินยอมเปลี่ยนผู้รับผิดชอบ'
export const PENDING_REASSIGNMENT_BADGE_GROUP: StatusBadgeGroup = 'warning'

const TEAM_SIDE_LABEL: Readonly<Record<AssignmentTeamSide, string>> = {
  inhouse: 'Inhouse',
  outsource: 'Outsource',
}

/** `40` §7.2 — inhouse = เขียว · outsource = ส้ม (คนละบรรทัดกับชื่อทีมเสมอ) */
const TEAM_SIDE_CLASS: Readonly<Record<AssignmentTeamSide, string>> = {
  inhouse: 'bg-emerald-100 text-emerald-800',
  outsource: 'bg-orange-100 text-orange-800',
}

export function teamSideLabel(side: AssignmentTeamSide | null): string | null {
  return side === null ? null : TEAM_SIDE_LABEL[side]
}

export function teamSideBadgeClass(side: AssignmentTeamSide | null): string {
  return side === null ? 'bg-slate-100 text-slate-600' : TEAM_SIDE_CLASS[side]
}

export interface AssignmentTimelineInput {
  state: AssignmentState
  assignedAt: string | null
  acceptedAt: string | null
}

/**
 * บรรทัดวันเวลาใต้ชื่อผู้รับผิดชอบ (`40` §7.2 — ต้องแสดงเสมอ ทั้ง desktop และการ์ดบนจอเล็ก)
 * `ready_to_assign` = ยังไม่มีวันเวลาให้แสดง → `null`
 */
export function assignedTimeline(item: AssignmentTimelineInput): string | null {
  if (item.state === 'ready_to_assign' || item.assignedAt === null) return null
  const assigned = `มอบหมายเมื่อ ${fmtDateTime(item.assignedAt)}`
  if (item.state !== 'accepted' || item.acceptedAt === null) return assigned
  return `${assigned} • รับงานเมื่อ ${fmtDateTime(item.acceptedAt)}`
}

export type AssignmentActionKind = 'assign' | 'reassign'

export interface AssignmentActionButton {
  action: AssignmentActionKind
  label: string
  tone: 'primary' | 'secondary'
}

export interface AssignmentRowInput {
  state: AssignmentState
  /** มีคำขอเปลี่ยนผู้รับผิดชอบค้างอยู่ ⇒ ขอซ้ำไม่ได้ (`REASSIGNMENT_ALREADY_PENDING` — `40` §12) */
  hasPendingReassignment: boolean
  /**
   * ผู้ใช้คนนี้ทำ assign/reassign ได้ไหม — มาจาก `canPerformAssignmentAction()` ฝั่ง server
   * (`40` §6.4) · `false` = **ไม่คืนปุ่มเลย** เพื่อให้หน้าจอซ่อน ไม่ใช่แสดงปุ่มเทา (`40` §7.2)
   */
  canAct: boolean
}

/** ปุ่มบนแถว/การ์ดของหน้ารายการ — ปุ่ม "ดูรายละเอียด" ไม่ผูกกับ settings จึงไม่อยู่ในชุดนี้ */
export function assignmentRowActions(input: AssignmentRowInput): AssignmentActionButton[] {
  if (!input.canAct) return []
  if (input.state === 'ready_to_assign') {
    return [{ action: 'assign', label: 'มอบหมาย', tone: 'primary' }]
  }
  if (input.hasPendingReassignment) return []
  return [{ action: 'reassign', label: 'เปลี่ยนผู้รับผิดชอบ', tone: 'secondary' }]
}

/**
 * คำบนปุ่มยืนยันของ modal (`40` §7.3) — `assigned` เปลี่ยนทันที · `accepted` ต้องขอความยินยอมก่อน
 * ใช้ `reassignBranchOf()` ตัวเดียวกับ API เพื่อไม่ให้ตรรกะ 2 ฝั่งหลุดจากกัน
 */
export function reassignConfirmLabel(state: AssignmentState): string {
  return reassignBranchOf(state) === 'immediate' ? 'ยืนยันเปลี่ยน' : 'ส่งคำขอเปลี่ยนผู้รับผิดชอบ'
}

/** คำเตือนในหน้า reassign — มีเฉพาะสาขาที่ไม่เปลี่ยนทันที (`40` §7.3) */
export function reassignWarning(state: AssignmentState): string | null {
  if (reassignBranchOf(state) === 'immediate') return null
  return 'เคสนี้พนักงานกดรับงานแล้ว — การเปลี่ยนผู้รับผิดชอบจะยังไม่มีผลทันที ระบบจะส่งคำขอให้พนักงานคนเดิมตอบรับก่อน (หมดเวลาแล้วระบบจะเปลี่ยนให้อัตโนมัติ) และเคสยังเป็นของคนเดิมจนกว่าคำขอจะสำเร็จ'
}

/**
 * เคสที่กำลังจะมอบหมาย/เปลี่ยนผู้รับผิดชอบ — ข้อมูลขั้นต่ำที่ Assignment Modal ต้องรู้
 * (รายละเอียดเคสเต็มโหลดเองใน `<CaseDetailModal>`) เปิดได้ทั้งจากแถวรายการและการ์ด Kanban
 */
export interface AssignmentTarget {
  caseId: string
  caseRef: string
  state: AssignmentState
  hasPendingReassignment: boolean
  teamId: string | null
  teamName: string | null
  teamSide: AssignmentTeamSide | null
  agentId: string | null
  agentName: string | null
}

export function targetFromListItem(item: {
  caseId: string
  caseRef: string
  state: AssignmentState
  teamId: string | null
  teamName: string | null
  teamSide: AssignmentTeamSide | null
  agentId: string | null
  agentName: string | null
  pendingReassignment: unknown | null
}): AssignmentTarget {
  return {
    caseId: item.caseId,
    caseRef: item.caseRef,
    state: item.state,
    hasPendingReassignment: item.pendingReassignment !== null,
    teamId: item.teamId,
    teamName: item.teamName,
    teamSide: item.teamSide,
    agentId: item.agentId,
    agentName: item.agentName,
  }
}

/** การ์ดบน Kanban คลิกแล้วเปิด modal ตัวเดียวกับหน้ารายการ (`40` §7.5) */
export function targetFromKanbanCard(
  card: { caseId: string; caseRef: string; state: AssignmentState; hasPendingReassignment: boolean },
  column: { agentId: string; fullName: string },
  board: { teamId: string; teamName: string; teamSide: AssignmentTeamSide },
): AssignmentTarget {
  return {
    caseId: card.caseId,
    caseRef: card.caseRef,
    state: card.state,
    hasPendingReassignment: card.hasPendingReassignment,
    teamId: board.teamId,
    teamName: board.teamName,
    teamSide: board.teamSide,
    agentId: column.agentId,
    agentName: column.fullName,
  }
}

/** สถานะบนการ์ด Kanban (`40` §7.5) — กรองที่ระดับการ์ด ไม่ซ่อนคอลัมน์พนักงาน */
export const KANBAN_CARD_FILTERS = ['all', 'assigned', 'accepted', 'pending_consent'] as const
export type KanbanCardFilter = (typeof KANBAN_CARD_FILTERS)[number]

export const KANBAN_CARD_FILTER_LABEL: Readonly<Record<KanbanCardFilter, string>> = {
  all: 'สถานะทั้งหมด',
  assigned: ASSIGNMENT_STATE_LABEL.assigned,
  accepted: ASSIGNMENT_STATE_LABEL.accepted,
  pending_consent: PENDING_REASSIGNMENT_LABEL,
}

export interface KanbanCardInput {
  state: AssignmentState
  hasPendingReassignment: boolean
}

export function kanbanCardMatches(card: KanbanCardInput, filter: KanbanCardFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'pending_consent':
      return card.hasPendingReassignment
    case 'assigned':
      return card.state === 'assigned'
    case 'accepted':
      return card.state === 'accepted'
  }
}

/**
 * เวลาที่เหลือก่อนคำขอหมดอายุ (`40` §6.1.1 `expires_at`) — ข้อความสั้นสำหรับ badge/รายการ
 * หมดเวลาแล้วบอกตรง ๆ ว่ารอระบบเปลี่ยนอัตโนมัติ (job อาจยังไม่รัน — `40` §11)
 */
export function expiresInText(expiresAt: string, now: Date): string {
  const remainingMs = new Date(expiresAt).getTime() - now.getTime()
  if (!Number.isFinite(remainingMs)) return '—'
  if (remainingMs <= 0) return 'หมดเวลาแล้ว — รอระบบเปลี่ยนให้อัตโนมัติ'
  const minutes = Math.floor(remainingMs / 60_000)
  if (minutes < 60) return `เหลืออีก ${minutes} นาที`
  const hours = Math.floor(minutes / 60)
  return `เหลืออีก ${hours} ชม. ${minutes % 60} นาที`
}
