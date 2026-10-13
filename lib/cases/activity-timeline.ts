import { closeFailReasonText } from '@/lib/field/fail-reasons'
import { fmtDate } from '@/lib/format/datetime'
import type { CaseStatusTimelineEntry } from '@/lib/cases/status-timeline'

/**
 * เหตุการณ์หลังรับเคสในประวัติเคส (mytester DO — ข้อสังเกตรอบ 4 "ประวัติเคสหยุดที่รับเคส" · `38` §7 v3.21)
 *
 * ประวัติสถานะเดิม (`status-timeline.ts`) อ่านเฉพาะ audit ของ `cases` ⇒ งานภาคสนาม/คลังซึ่ง audit ที่ตารางอื่น
 * ไม่ปรากฏ · ตัวนี้แปลง audit ของ `case_assignments` / `assets` + ล็อตส่งมอบที่ยืนยันแล้ว เป็นเหตุการณ์อ่านง่าย
 * **pure** ไม่มี I/O · **ไม่เพิ่ม state** — แค่อ่านสิ่งที่บันทึกไว้แล้ว
 *
 * ⚠️ ข้อมูลภายในเท่านั้น (ชื่อพนักงาน/เหตุผลตีกลับ) — ฝั่งบริษัทไฟแนนซ์ได้รายการว่างเสมอ (`getCase()` คืนก่อนโหลด ·
 * พอร์ทัลใช้ serializer แบบ whitelist ของตัวเองที่ไม่มีช่องนี้)
 */

export type CaseActivityKind = 'assignment' | 'field' | 'success' | 'fail' | 'revision' | 'warehouse'

export interface CaseActivityEntry {
  at: string
  label: string
  note: string | null
  actorName: string | null
  kind: CaseActivityKind
}

/** แถว audit ดิบ (target `case_assignments` หรือ `assets`) — JSON before/after อ่านแบบหลวม */
export interface CaseActivityAuditRow {
  targetType: string
  targetId: string
  action: string
  before: unknown
  after: unknown
  reason: string | null
  actorName: string | null
  createdAt: Date
}

/** ล็อตส่งมอบที่ยืนยันแล้วซึ่งมีเครื่องของเคสนี้ */
export interface CaseActivityLotRow {
  lotNumber: string
  confirmedAt: Date
  confirmedByName: string | null
}

export interface CaseActivityInput {
  audits: readonly CaseActivityAuditRow[]
  lots: readonly CaseActivityLotRow[]
  /** ชื่อผู้ใช้ตาม id (พนักงานที่ถูกมอบหมาย/โอน) */
  userNames: ReadonlyMap<string, string>
  /** พนักงานของแต่ละแถวมอบหมาย (`case_assignments.id → agent_id`) */
  assignmentAgents: ReadonlyMap<string, string>
  /**
   * ผู้มอบหมายของแต่ละแถว (`case_assignments.id → created_by`) — แถวที่เกิดจากคำขอเปลี่ยนผู้รับผิดชอบ
   * `created_by` = ผู้ส่งคำขอ (UAT BUG-043 · mytester2 C2-01) ใช้เป็น "ผู้ทำ" ของการเปลี่ยนแบบยินยอม (mytester5 C5-01)
   * ไม่ระบุ = ไม่แทนผู้ทำ
   */
  assignmentCreators?: ReadonlyMap<string, string>
}

function field(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as Record<string, unknown>)[key]
}

function text(value: unknown, key: string): string | null {
  const raw = field(value, key)
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null
}

function events(value: unknown): string[] {
  const raw = field(value, 'events')
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
}

function trimmed(value: string | null): string | null {
  const result = value?.trim() ?? ''
  return result === '' ? null : result
}

const UNKNOWN_AGENT = 'พนักงาน'

function nameOf(input: CaseActivityInput, userId: string | null): string {
  return userId === null ? UNKNOWN_AGENT : (input.userNames.get(userId) ?? UNKNOWN_AGENT)
}

type ActivityDraft = Omit<CaseActivityEntry, 'at' | 'actorName'> & { actorName?: string | null }

/**
 * mytester5 C5-01 — การเปลี่ยนผู้รับผิดชอบผ่านคำขอ (ยินยอม/ครบเวลา) ผู้ทำ = ผู้ส่งคำขอ
 * (`reassignment_history.reassigned_by` — `40` v2.5) ไม่ใช่พนักงานที่กดยินยอม (actor ของ audit)
 */
function reassignRequesterName(row: CaseActivityAuditRow, input: CaseActivityInput): string | null {
  const newAssignmentId = text(row.after, 'newAssignmentId')
  const requester =
    text(row.after, 'requestedBy') ?? (newAssignmentId === null ? null : (input.assignmentCreators?.get(newAssignmentId) ?? null))
  return requester === null ? null : (input.userNames.get(requester) ?? null)
}

function assignmentEntry(row: CaseActivityAuditRow, input: CaseActivityInput): ActivityDraft | null {
  const status = text(row.after, 'status')
  const agentOfRow = input.assignmentAgents.get(row.targetId) ?? null

  if (row.action === 'create') {
    const round = field(row.after, 'trackingRound')
    const roundText = typeof round === 'number' && round > 1 ? ` (รอบติดตามที่ ${round})` : ''
    return { label: `มอบหมายงานให้ ${nameOf(input, text(row.after, 'agentId') ?? agentOfRow)}${roundText}`, note: null, kind: 'assignment' }
  }
  if (row.action === 'update' && text(row.after, 'newAssignmentId') !== null) {
    const from = nameOf(input, text(row.before, 'agentId') ?? agentOfRow)
    const to = nameOf(input, text(row.after, 'agentId'))
    const resolution = text(row.after, 'resolution')
    const suffix =
      resolution === 'timeout_auto' ? ' (ครบเวลารอความยินยอม)' : resolution === 'consented' ? ' (พนักงานยินยอม)' : ''
    const entry: ActivityDraft = { label: `เปลี่ยนผู้รับผิดชอบ ${from} → ${to}${suffix}`, note: trimmed(row.reason), kind: 'assignment' }
    if (resolution === null) return entry
    const requester = reassignRequesterName(row, input)
    return requester === null ? entry : { ...entry, actorName: requester }
  }
  if (row.action === 'reject' && status === 'needs_revision') {
    return { label: 'ตีกลับหลักฐานให้แก้ไข', note: trimmed(row.reason), kind: 'revision' }
  }
  if (row.action !== 'status_change') return null
  if (status === 'accepted_unscheduled' && events(row.after).includes('assignment.accepted')) {
    return { label: `${nameOf(input, agentOfRow)} รับงาน`, note: null, kind: 'assignment' }
  }
  if (status === 'scheduled') {
    const date = text(row.after, 'scheduledDate')
    return { label: date === null ? 'จัดวันลงพื้นที่' : `จัดวันลงพื้นที่ ${fmtDate(date)}`, note: null, kind: 'field' }
  }
  if (status === 'closed_success' || status === 'closed_fail') {
    const resubmitted = text(row.after, 'resubmittedAt') !== null
    const outcome = status === 'closed_success' ? 'ปิดงานสำเร็จ' : 'ปิดงานไม่สำเร็จ'
    const failReason = status === 'closed_fail' ? closeFailReasonText(text(row.after, 'failReason'), null) : null
    return {
      label: resubmitted ? `ส่งหลักฐานใหม่ — ${outcome}` : outcome,
      note: failReason,
      kind: status === 'closed_success' ? 'success' : 'fail',
    }
  }
  return null
}

function assetEntry(row: CaseActivityAuditRow): ActivityDraft | null {
  if (row.action === 'status_change' && events(row.after).includes('asset.intake')) {
    return { label: 'คลังรับเครื่องเข้าคลัง', note: null, kind: 'warehouse' }
  }
  if (row.action === 'reject') return { label: 'คลังไม่รับเครื่อง', note: trimmed(row.reason), kind: 'revision' }
  return null
}

/** เหตุการณ์หลังรับเคส เรียงเก่า → ใหม่ · audit ที่ไม่ใช่เหตุการณ์สำคัญ (เช่น สลับลำดับงานในวัน) ถูกตัดทิ้ง */
export function buildCaseActivityTimeline(input: CaseActivityInput): CaseActivityEntry[] {
  const fromAudits = input.audits.flatMap((row): (CaseActivityEntry & { time: number })[] => {
    const entry = row.targetType === 'assets' ? assetEntry(row) : row.targetType === 'case_assignments' ? assignmentEntry(row, input) : null
    if (entry === null) return []
    const { actorName, ...rest } = entry
    return [{ ...rest, at: row.createdAt.toISOString(), actorName: actorName ?? row.actorName, time: row.createdAt.getTime() }]
  })
  const fromLots = input.lots.map((lot) => ({
    at: lot.confirmedAt.toISOString(),
    time: lot.confirmedAt.getTime(),
    label: `ยืนยันล็อตส่งมอบ ${lot.lotNumber}`,
    note: null,
    actorName: lot.confirmedByName,
    kind: 'warehouse' as const,
  }))
  return [...fromAudits, ...fromLots]
    .sort((a, b) => a.time - b.time)
    .map(({ time: _time, ...entry }) => entry)
}

/** แถวของประวัติเคสบนหน้าจอ — สถานะเคส (มี badge) หรือเหตุการณ์ภาคสนาม/คลัง */
export type CaseHistoryItem =
  | { type: 'status'; entry: CaseStatusTimelineEntry }
  | { type: 'activity'; entry: CaseActivityEntry }

/** รวมประวัติสถานะ + เหตุการณ์ เรียงตามเวลา (เวลาเท่ากัน = สถานะเคสก่อน) */
export function mergeCaseHistory(
  statusHistory: readonly CaseStatusTimelineEntry[],
  activityHistory: readonly CaseActivityEntry[],
): CaseHistoryItem[] {
  const items: (CaseHistoryItem & { time: number; order: number })[] = [
    ...statusHistory.map((entry, index) => ({ type: 'status' as const, entry, time: Date.parse(entry.at), order: index })),
    ...activityHistory.map((entry, index) => ({
      type: 'activity' as const,
      entry,
      time: Date.parse(entry.at),
      order: statusHistory.length + index,
    })),
  ]
  return items
    .sort((a, b) => a.time - b.time || a.order - b.order)
    .map((item): CaseHistoryItem => (item.type === 'status' ? { type: 'status', entry: item.entry } : { type: 'activity', entry: item.entry }))
}
