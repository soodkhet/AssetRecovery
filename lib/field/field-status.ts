import { AssignmentError } from '@/lib/assignments/errors'
import type { AssignmentStatus, CaseOutcome } from '@/lib/generated/prisma/enums'

/**
 * State machine ของงานภาคสนาม (ไฟล์ 41 §9/§10) — **pure ล้วน**
 * (ห้าม import อะไรที่แตะ Prisma — หน้าจอ 2.10–2.12 เรียกตัวเดียวกับที่ API บังคับ)
 *
 * ```
 * pending_accept → accepted_unscheduled → scheduled → closed_success | closed_fail
 *                        └──────────────────┴────────→ reassigned_away (ไฟล์ 40)
 * closed_success | closed_fail → needs_revision → closed_success | closed_fail (เดิม)
 * ```
 *
 * ⚠️ `assignment_status` เป็น sub-state ของ `case.status = approved` (ไฟล์ 38) ไม่ใช่ state ของเคส
 * ⚠️ ห้าม if สถานะเองในหน้าจอ/route — ทุกจุดต้องผ่าน {@link assertFieldAction} / {@link fieldGroupOf}
 */

export const FIELD_STATUSES = [
  'pending_accept',
  'accepted_unscheduled',
  'scheduled',
  'closed_success',
  'closed_fail',
  'needs_revision',
  'reassigned_away',
] as const satisfies readonly AssignmentStatus[]

/** action ของไฟล์ 41 §8 ที่ทำให้ `assignment_status` ขยับ (action ที่ไม่ขยับสถานะดู {@link FIELD_STATE_ACTIONS}) */
export const FIELD_ACTIONS = [
  'accept_case',
  'schedule_case',
  'submit_close_case',
  'reject_evidence',
  'resubmit_close_case',
] as const
export type FieldAction = (typeof FIELD_ACTIONS)[number]

/** action ที่ทำได้โดย**ไม่**เปลี่ยนสถานะ (`41` §8) — ยังต้องเช็คว่าสถานะปัจจุบันอนุญาต */
export const FIELD_STATE_ACTIONS = ['reorder_schedule', 'set_travel_origin', 'add_checkin', 'save_close_draft'] as const
export type FieldStateAction = (typeof FIELD_STATE_ACTIONS)[number]

interface TransitionRule {
  /** สถานะที่ทำ action นี้ได้ (`41` §10 คอลัมน์ Allowed Next States) */
  readonly from: readonly AssignmentStatus[]
  /** null = ปลายทางขึ้นกับ outcome (`submit_close_case`/`resubmit_close_case`) */
  readonly to: AssignmentStatus | null
  readonly label: string
}

export const FIELD_TRANSITIONS: Readonly<Record<FieldAction, TransitionRule>> = {
  accept_case: { from: ['pending_accept'], to: 'accepted_unscheduled', label: 'รับงาน' },
  schedule_case: { from: ['accepted_unscheduled'], to: 'scheduled', label: 'จัดวันที่' },
  submit_close_case: { from: ['scheduled'], to: null, label: 'ยืนยันปิดงาน' },
  // ตีกลับหลักฐาน = สิทธิ์ของเจ้าหน้าที่อนุมัติเคสเท่านั้น (`41` §10.1) — implement ใน Phase 2.9
  reject_evidence: { from: ['closed_success', 'closed_fail'], to: 'needs_revision', label: 'ตีกลับหลักฐาน' },
  resubmit_close_case: { from: ['needs_revision'], to: null, label: 'ส่งกลับยืนยันอีกครั้ง' },
}

/** สถานะที่ยังทำงานภาคสนามอยู่ (แก้ draft/เช็คอิน/จุดเริ่มเดินทางได้) */
const WORKABLE_STATUSES: readonly AssignmentStatus[] = ['scheduled', 'needs_revision']

const STATE_ACTION_FROM: Readonly<Record<FieldStateAction, readonly AssignmentStatus[]>> = {
  reorder_schedule: ['scheduled'],
  set_travel_origin: WORKABLE_STATUSES,
  add_checkin: ['scheduled'],
  save_close_draft: ['scheduled'],
}

/** `41` §10 — สถานะไม่ตรงกับ action = `ASSIGNMENT_INVALID_STATUS` (ไม่มี code เฉพาะใน `41` §12) */
export function assertFieldAction(status: AssignmentStatus, action: FieldAction): void {
  if (!FIELD_TRANSITIONS[action].from.includes(status)) {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', {
      context: { status, action },
      detail: `action ${action} ทำได้จากสถานะ ${FIELD_TRANSITIONS[action].from.join('|')} เท่านั้น`,
    })
  }
}

/** action ที่ไม่เปลี่ยนสถานะ (`41` §8) — เช็คอิน/draft ทำได้เฉพาะเคสที่จัดวันแล้ว */
export function assertFieldStateAction(status: AssignmentStatus, action: FieldStateAction): void {
  if (!STATE_ACTION_FROM[action].includes(status)) {
    throw new AssignmentError('ASSIGNMENT_INVALID_STATUS', {
      context: { status, action },
      detail: `action ${action} ทำได้จากสถานะ ${STATE_ACTION_FROM[action].join('|')} เท่านั้น`,
    })
  }
}

/** ปลายทางของการปิดงานตาม outcome ที่เลือก (`41` §9) — ค่าเดียวกันทั้ง submit และ resubmit */
export function closedStatusOf(outcome: CaseOutcome): AssignmentStatus {
  return outcome === 'closed_success' ? 'closed_success' : 'closed_fail'
}

/** 4 กลุ่มของแท็บงานภาคสนาม (`41` §7.2/§7.3/§7.5/§7.11) */
export const FIELD_GROUPS = ['pending_accept', 'accepted', 'tracking', 'closed'] as const
export type FieldGroup = (typeof FIELD_GROUPS)[number]

const GROUP_OF: Readonly<Record<AssignmentStatus, FieldGroup>> = {
  pending_accept: 'pending_accept',
  accepted_unscheduled: 'accepted',
  scheduled: 'tracking',
  // เคสที่ถูกตีกลับหลักฐานยังเป็นงานค้างของพนักงานคนเดิม — อยู่แท็บ "กำลังติดตาม" ไม่ใช่ "จบงาน" (`41` §7.6)
  needs_revision: 'tracking',
  closed_success: 'closed',
  closed_fail: 'closed',
  reassigned_away: 'closed',
}

export function fieldGroupOf(status: AssignmentStatus): FieldGroup {
  return GROUP_OF[status]
}

/** สถานะทั้งหมดของกลุ่มหนึ่ง — ใช้ประกอบ `where` ของ query (ห้าม hardcode รายการสถานะที่ route) */
export function statusesInGroup(group: FieldGroup): AssignmentStatus[] {
  return FIELD_STATUSES.filter((status) => GROUP_OF[status] === group)
}

export function isFieldGroup(value: string): value is FieldGroup {
  return (FIELD_GROUPS as readonly string[]).includes(value)
}
