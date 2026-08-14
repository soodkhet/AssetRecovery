import {
  allowedActionsFrom,
  CASE_ACTION_CAPABILITIES,
  CASE_STATUS_RULES,
  type CaseStatusAction,
} from '@/lib/cases/state-machine'

/**
 * ปุ่ม action ของ Case Detail/Review Modal และแถวรายการ (`38` §7.5 · §8) — **pure ล้วน**
 *
 * กติกา: ปุ่มบนหน้าจอ **ต้องมาจาก `allowedActionsFrom()` + `CASE_ACTION_CAPABILITIES`** เสมอ
 * ห้าม hardcode เงื่อนไขสถานะ/สิทธิ์ซ้ำใน JSX (Rule 04 + DEC-002 — API ตรวจซ้ำอยู่แล้ว)
 */

/** 4 โหมดของ modal ตาม `38` §7.5 (ไม่มี modal แยกระหว่าง "ดู" กับ "พิจารณา") */
export type CaseDetailMode = 'review' | 'recycle_request' | 'recycle_review' | 'readonly'

export function caseDetailMode(status: string): CaseDetailMode {
  if (status === 'pending_review') return 'review'
  if (status === 'closed_fail') return 'recycle_request'
  if (status === 'pending_recycle_review') return 'recycle_review'
  return 'readonly'
}

export interface CaseActionButton {
  action: CaseStatusAction
  label: string
  tone: 'primary' | 'danger' | 'secondary'
  /** ต้องกรอกเหตุผล/หมายเหตุก่อนยืนยัน (`38` §12 — ตัวบังคับจริงอยู่ `assertStatusChange()`) */
  reasonRequired: boolean
}

/**
 * ชื่อปุ่มบน modal — `38` §7.5 เรียกบางปุ่มต่างจาก label กลางใน `CASE_STATUS_RULES`
 * (เช่น `accept` = "รับเคส & ยืนยันทีม" เพราะกดแล้วยืนยันทีมไปพร้อมกัน)
 */
const MODAL_LABEL: Partial<Record<CaseStatusAction, string>> = {
  accept: 'รับเคส & ยืนยันทีม',
  create_recycle_request: 'ขอรีไซเกิล (re-track)',
  reject_recycle: 'ไม่อนุมัติ',
}

const TONE: Record<CaseStatusAction, CaseActionButton['tone']> = {
  review: 'primary',
  accept: 'primary',
  reject: 'danger',
  request_more_info: 'secondary',
  return_to_draft: 'secondary',
  create_recycle_request: 'primary',
  approve_recycle: 'primary',
  reject_recycle: 'danger',
}

/** ลำดับปุ่มบน modal ต่อโหมด (`38` §7.5) — ซ้ายไปขวา */
const MODE_ACTIONS: Record<CaseDetailMode, readonly CaseStatusAction[]> = {
  review: ['reject', 'request_more_info', 'accept'],
  recycle_request: ['create_recycle_request'],
  recycle_review: ['reject_recycle', 'approve_recycle'],
  readonly: [],
}

/**
 * ปุ่ม workflow บนแถวรายการ (`38` §8) — `review`/`return_to_draft` ไม่อยู่บน modal
 * เพราะ §7.5 ล็อกให้สถานะ draft/need_info เป็น **อ่านอย่างเดียว** บน modal
 */
const ROW_ACTIONS: readonly CaseStatusAction[] = ['review', 'return_to_draft']

function toButton(action: CaseStatusAction): CaseActionButton {
  return {
    action,
    label: MODAL_LABEL[action] ?? CASE_STATUS_RULES[action].label,
    tone: TONE[action],
    reasonRequired: CASE_STATUS_RULES[action].reasonRequired,
  }
}

function allowed(
  status: string,
  candidates: readonly CaseStatusAction[],
  can: (capability: string) => boolean,
): CaseActionButton[] {
  const fromStatus = allowedActionsFrom(status)
  return candidates
    .filter((action) => fromStatus.includes(action))
    .filter((action) => CASE_ACTION_CAPABILITIES[action].some((capability) => can(capability)))
    .map(toButton)
}

/** ปุ่มใน Case Detail/Review Modal — ว่างเปล่า = โหมดอ่านอย่างเดียว (มีแต่ปุ่ม "ปิดหน้าต่าง") */
export function caseModalActions(status: string, can: (capability: string) => boolean): CaseActionButton[] {
  return allowed(status, MODE_ACTIONS[caseDetailMode(status)], can)
}

/** ปุ่ม workflow บนแถวรายการ/การ์ด (ส่งตรวจสอบ · กลับไปแก้ไขเป็นร่าง) */
export function caseRowActions(status: string, can: (capability: string) => boolean): CaseActionButton[] {
  return allowed(status, ROW_ACTIONS, can)
}

/**
 * ช่องเหตุผล/หมายเหตุแสดงเมื่อไหร่ (`38` §7.5) — เฉพาะโหมดที่มี action ซึ่งบังคับเหตุผล
 * (pending_review เพราะ reject/need_info · closed_fail และ pending_recycle_review เพราะ recycle)
 */
export function showsReasonBox(status: string): boolean {
  return caseDetailMode(status) !== 'readonly'
}
