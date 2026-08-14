import type { AssignmentState } from '@/lib/assignments/assignment'
import type { AgentDecisionSupport } from '@/lib/assignments/success-rate'

/**
 * DTO ของโมดูลมอบหมายงาน (`40` §17.1 · `45` §6.2) — **type-only** เพื่อให้ฝั่ง client import ได้
 * โดยไม่ลาก Prisma เข้า bundle (กับดัก 2026-08-14)
 *
 * วันเวลาเป็น ISO 8601 UTC เสมอ (Rule 01) — หน้าจอแปลงเป็น พ.ศ./Asia-Bangkok ด้วย `fmtDateTime`
 */

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
  teamSide: 'inhouse' | 'outsource' | null
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

export interface AssignmentListResultDto {
  items: AssignmentListItemDto[]
  total: number
  page: number
  limit: number
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
  cases: AgentCaseDto[]
}

export interface KanbanBoardDto {
  teamId: string
  teamName: string
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
