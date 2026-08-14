import type { AssignmentState } from '@/lib/assignments/assignment'
import type { AgentDecisionSupport } from '@/lib/assignments/success-rate'

/**
 * DTO ของโมดูลมอบหมายงาน (`40` §17.1 · `45` §6.2) — **type-only** เพื่อให้ฝั่ง client import ได้
 * โดยไม่ลาก Prisma เข้า bundle (กับดัก 2026-08-14)
 *
 * วันเวลาเป็น ISO 8601 UTC เสมอ (Rule 01) — หน้าจอแปลงเป็น พ.ศ./Asia-Bangkok ด้วย `fmtDateTime`
 */

/** ฝั่งของทีม (`09` §7 `Team.side`) — badge Inhouse/Outsource ของ `40` §7.2/§7.3/§7.5 */
export type AssignmentTeamSide = 'inhouse' | 'outsource'

export interface PendingReassignmentDto {
  id: string
  requestedBy: string
  requestedByName: string
  requestedAt: string
  newAgentId: string
  newAgentName: string
  reason: string
  expiresAt: string
  status: 'waiting_consent'
}

export interface AssignmentListItemDto {
  caseId: string
  caseRef: string
  trackingRound: number
  companyId: string
  companyName: string
  debtorName: string | null
  province: string | null
  assetDescription: string | null
  debtAmountSatang: number | null
  teamId: string | null
  teamName: string | null
  /** `40` §7.2 — inhouse/outsource แสดงคนละบรรทัดกับชื่อทีม */
  teamSide: AssignmentTeamSide | null
  state: AssignmentState
  assignmentId: string | null
  agentId: string | null
  agentName: string | null
  assignedAt: string | null
  assignedBy: string | null
  assignedByName: string | null
  acceptedAt: string | null
  /** มีค่า = มีคำขอเปลี่ยนผู้รับผิดชอบรอผลอยู่ (badge แยกจากสถานะ — `40` §7.2) */
  pendingReassignment: PendingReassignmentDto | null
}

/**
 * ทีมที่ผู้ใช้คนนี้เห็นได้ในหน้ามอบหมาย (`40` §7.1) — ส่งมากับ list เพื่อให้หน้าจอทำ filter ทีม
 * และเลือกกระดาน Kanban ได้โดยไม่ต้องเรียก `GET /api/teams` (endpoint นั้นต้องมี `view_master_data`
 * ซึ่งผู้จัดการ/หัวหน้าทีมไม่จำเป็นต้องมี — `25` §7.1)
 *
 * มี **1 ทีม** = หัวหน้าทีม ⇒ หน้าจอไม่ต้องแสดงตัวเลือกทีมเลย (`40` §7.1)
 */
export interface AssignmentTeamOptionDto {
  teamId: string
  teamName: string
  teamSide: AssignmentTeamSide
}

export interface AssignmentListResultDto {
  items: AssignmentListItemDto[]
  total: number
  page: number
  limit: number
  teams: AssignmentTeamOptionDto[]
}

export interface AgentCaseDto {
  caseId: string
  caseRef: string
  debtorName: string | null
  province: string | null
  assetDescription: string | null
  debtAmountSatang: number | null
  state: AssignmentState
  assignedAt: string | null
  acceptedAt: string | null
  /** มีคำขอเปลี่ยนผู้รับผิดชอบค้างอยู่ — การ์ด Kanban ต้องมี badge แยกจากสถานะ (`40` §7.5) */
  hasPendingReassignment: boolean
}

export interface TeamAgentDto extends AgentDecisionSupport {
  agentId: string
  fullName: string
  phone: string | null
  status: string
}

export interface TeamAgentsResultDto {
  teamId: string
  teamName: string
  /** `40` §7.3 — การ์ดพนักงานต้องมี badge Inhouse/Outsource ของทีมที่สังกัด */
  teamSide: AssignmentTeamSide
  agents: TeamAgentDto[]
}

export interface AgentCasesResultDto {
  teamId: string
  agentId: string
  cases: AgentCaseDto[]
}

/** 1 คอลัมน์ = 1 พนักงาน — คอลัมน์ว่างต้องยังแสดงอยู่ (`40` §20 Kanban filter) */
export interface KanbanColumnDto {
  agentId: string
  fullName: string
  activeCaseCount: number
  /** `40` §7.5 — หัวคอลัมน์แสดง % ความสำเร็จสะสม (`null` = ยังไม่เคยได้รับมอบหมาย ⇒ แสดง N/A) */
  successRate: number | null
  cases: AgentCaseDto[]
}

export interface KanbanBoardDto {
  teamId: string
  teamName: string
  teamSide: AssignmentTeamSide
  columns: KanbanColumnDto[]
}

export interface AssignmentActionResultDto {
  caseId: string
  assignmentId: string | null
  state: AssignmentState
  agentId: string | null
  acceptedAt: string | null
  pendingReassignment: PendingReassignmentDto | null
  /** ชื่อ event ที่ต้องยิงเมื่อ event bus พร้อม (`40` §17.2) — ตอนนี้บันทึกไว้ใน audit */
  events: readonly string[]
}
