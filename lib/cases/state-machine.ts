import type { DomainEventName } from '@/lib/api/event-names'
import { CaseError } from '@/lib/cases/errors'

/**
 * State machine ของเคสฝั่งรับเคส (ไฟล์ 38 §9/§10) — **pure ล้วน ใช้ร่วม FE/BE**
 * ห้าม import อะไรที่แตะ Prisma/`next/*` (ปุ่มบนหน้าจอเรียกตัวเดียวกับที่ API บังคับ)
 *
 * ```
 * draft → pending_review → approved | rejected | need_info → draft
 * closed_fail → pending_recycle_review → approved (tracking_round +1) | closed_fail
 * ```
 *
 * ⚠️ state/enum ตรง `23` + `02` §3 เป๊ะ — ห้ามเพิ่ม state ใหม่ที่นี่ (Rule 04)
 * สถานะ `active`/`closed_success`/`closed_fail` เป็นของไฟล์ 40/41 — ไฟล์นี้แตะได้เฉพาะขา recycle
 */

export const CASE_STATUSES = [
  'draft',
  'pending_review',
  'need_info',
  'approved',
  'rejected',
  'active',
  'closed_success',
  'closed_fail',
  'pending_recycle_review',
] as const
export type CaseStatusValue = (typeof CASE_STATUSES)[number]

/** action ของ `PATCH /api/cases/:id/status` (`38` §8 ตาราง Actions & Buttons) */
export const CASE_STATUS_ACTIONS = [
  'review',
  'accept',
  'reject',
  'request_more_info',
  'return_to_draft',
  'create_recycle_request',
  'approve_recycle',
  'reject_recycle',
] as const
export type CaseStatusAction = (typeof CASE_STATUS_ACTIONS)[number]

interface ActionRule {
  /** สถานะที่ทำ action นี้ได้ (`38` §10 คอลัมน์ Allowed Next States) */
  readonly from: readonly CaseStatusValue[]
  readonly to: CaseStatusValue
  /** ต้องมีเหตุผล/หมายเหตุประกอบเสมอ (`38` §8/§12 · `45` §6.1) */
  readonly reasonRequired: boolean
  /** action ฝั่ง recycle — สถานะไม่ตรงต้องตอบ `CASE_RECYCLE_INVALID_STATUS` (`38` §12) */
  readonly recycle: boolean
  /** ต้องผ่าน `caseReadiness()` ก่อน (ข้อมูล + เอกสาร required ครบ — `38` §9) */
  readonly requiresReadiness: boolean
  readonly label: string
}

export const CASE_STATUS_RULES: Readonly<Record<CaseStatusAction, ActionRule>> = {
  review: {
    from: ['draft'],
    to: 'pending_review',
    reasonRequired: false,
    recycle: false,
    requiresReadiness: true,
    label: 'ส่งตรวจสอบเคส',
  },
  accept: {
    from: ['pending_review'],
    to: 'approved',
    reasonRequired: false,
    recycle: false,
    requiresReadiness: false,
    label: 'รับเคส',
  },
  reject: {
    from: ['pending_review'],
    to: 'rejected',
    reasonRequired: true,
    recycle: false,
    requiresReadiness: false,
    label: 'ไม่รับเคส',
  },
  request_more_info: {
    from: ['pending_review'],
    to: 'need_info',
    reasonRequired: true,
    recycle: false,
    requiresReadiness: false,
    label: 'ขอข้อมูลเพิ่ม',
  },
  /**
   * `38` §10 — `need_info` มี allowed next state เดียวคือ `draft` (กลับไปเติมข้อมูล)
   * เอกสาร §8 ไม่ได้ตั้งชื่อปุ่มไว้ จึงใช้ชื่อ action ตามความหมายของ transition ไม่สร้าง state ใหม่
   */
  return_to_draft: {
    from: ['need_info'],
    to: 'draft',
    reasonRequired: false,
    recycle: false,
    requiresReadiness: false,
    label: 'กลับไปแก้ไขเป็นร่าง',
  },
  create_recycle_request: {
    from: ['closed_fail'],
    to: 'pending_recycle_review',
    reasonRequired: true,
    recycle: true,
    requiresReadiness: false,
    label: 'ขอรีไซเกิล',
  },
  approve_recycle: {
    from: ['pending_recycle_review'],
    to: 'approved',
    reasonRequired: false,
    recycle: true,
    requiresReadiness: false,
    label: 'อนุมัติรีไซเกิล',
  },
  reject_recycle: {
    from: ['pending_recycle_review'],
    to: 'closed_fail',
    reasonRequired: true,
    recycle: true,
    requiresReadiness: false,
    label: 'ไม่อนุมัติรีไซเกิล',
  },
}

/** action ที่ทำได้จากสถานะปัจจุบัน — UI ใช้ตัดสินว่าจะแสดงปุ่มไหน (ยังต้องผ่าน capability อีกชั้น) */
export function allowedActionsFrom(status: string): CaseStatusAction[] {
  return CASE_STATUS_ACTIONS.filter((action) =>
    (CASE_STATUS_RULES[action].from as readonly string[]).includes(status),
  )
}

export function nextStatusOf(action: CaseStatusAction): CaseStatusValue {
  return CASE_STATUS_RULES[action].to
}

/** action ที่ต้องเพิ่ม `tracking_round` (`38` §6.6 — อนุมัติรีไซเกิลเท่านั้น) */
export function bumpsTrackingRound(action: CaseStatusAction): boolean {
  return action === 'approve_recycle'
}

export function isCaseStatusAction(value: string): value is CaseStatusAction {
  return (CASE_STATUS_ACTIONS as readonly string[]).includes(value)
}

/**
 * capability ที่ต้องมีต่อ action (`38` §13)
 * - `review` = ธุรการ/แอดมิน/ผู้จัดการ (ตรวจความครบถ้วนแล้วส่งให้พิจารณา)
 * - `accept`/`reject`/`request_more_info` + recycle ทั้ง 3 = **เจ้าหน้าที่อนุมัติเคสเท่านั้น** (`approve_case`)
 * - `return_to_draft` = ฝั่งคนเติมข้อมูล (ธุรการ/แอดมิน/ผู้จัดการ)
 */
export const CASE_ACTION_CAPABILITIES: Readonly<Record<CaseStatusAction, readonly string[]>> = {
  review: ['record_admin_data', 'approve_case', 'assign_case'],
  accept: ['approve_case'],
  reject: ['approve_case'],
  request_more_info: ['approve_case'],
  return_to_draft: ['record_admin_data', 'approve_case', 'assign_case'],
  create_recycle_request: ['approve_case'],
  approve_recycle: ['approve_case'],
  reject_recycle: ['approve_case'],
}

/**
 * Event ที่ต้องยิงเมื่อ action สำเร็จ (`38` §16/§17.2 — ชื่อจากทะเบียน `lib/api/event-names.ts`)
 *
 * `case.status_changed` ยิงทุกครั้งที่สถานะเปลี่ยน · `case.approved` ยิงซ้ำได้ทุกรอบที่อนุมัติรีไซเกิล
 * (ไฟล์ 40 ต้องรองรับการสร้าง assignment ใหม่ทับรอบก่อนหน้า — `38` §16)
 *
 * ⚠️ ยังไม่มี event bus จริงในระบบ (Notification/Jobs = Phase 5.1 · consumer ฝั่ง 40 = Phase 2.6)
 * ชั้น service จึงบันทึกรายชื่อนี้ลง audit ของ transition ไว้ก่อน เพื่อให้ตอนต่อ bus จริงไม่ต้องเดาย้อนหลัง
 */
export function caseEventsFor(action: CaseStatusAction): DomainEventName[] {
  switch (action) {
    case 'accept':
      return ['case.status_changed', 'case.approved']
    case 'reject':
      return ['case.status_changed', 'case.rejected']
    case 'request_more_info':
      return ['case.status_changed', 'case.need_info_requested']
    case 'approve_recycle':
      return ['case.status_changed', 'case.recycle_approved', 'case.approved']
    default:
      return ['case.status_changed']
  }
}

export interface StatusChangeIntent {
  /** มีเหตุผล/หมายเหตุที่ไม่ว่างส่งมาหรือไม่ */
  hasReason: boolean
  /** ผู้พิจารณาเปลี่ยนทีมจากที่ระบบเสนอ (`38` §13 — ต้องมี reason) */
  teamChanged?: boolean
  /** มีเหตุผลของการเปลี่ยนทีมหรือไม่ (แยกจาก reason ของ action) */
  hasTeamChangeReason?: boolean
}

/**
 * ยามเดียวของการเปลี่ยนสถานะ — โยน error ตาม `38` §12 เมื่อผิดกติกา
 *
 * ลำดับการตรวจ: สถานะต้นทาง → เหตุผลของ action → เหตุผลของการเปลี่ยนทีม
 * (ความครบถ้วนของข้อมูล/เอกสารตรวจแยกด้วย `caseReadiness()` ที่ชั้น service เพราะต้องอ่านจาก DB)
 */
export function assertStatusChange(
  currentStatus: string,
  action: CaseStatusAction,
  intent: StatusChangeIntent,
): CaseStatusValue {
  const rule = CASE_STATUS_RULES[action]

  if (!(rule.from as readonly string[]).includes(currentStatus)) {
    if (rule.recycle) {
      throw new CaseError('CASE_RECYCLE_INVALID_STATUS', { context: { status: currentStatus, action } })
    }
    throw new CaseError('CASE_INVALID_STATUS_TRANSITION', {
      context: { status: currentStatus, action, allowedFrom: rule.from },
    })
  }

  if (rule.reasonRequired && !intent.hasReason) {
    // `38` §12 แยก code ของ recycle ไว้ต่างหาก (สร้างคำขอ = หมายเหตุ · ไม่อนุมัติ = เหตุผล)
    if (action === 'create_recycle_request') throw new CaseError('CASE_RECYCLE_NOTE_REQUIRED')
    if (action === 'reject_recycle') throw new CaseError('CASE_RECYCLE_REJECT_REASON_REQUIRED')
    throw new CaseError('CASE_STATUS_REASON_REQUIRED', { context: { action } })
  }

  if (intent.teamChanged === true && intent.hasTeamChangeReason !== true) {
    throw new CaseError('CASE_STATUS_REASON_REQUIRED', { context: { action, field: 'teamChangeReason' } })
  }

  return rule.to
}
