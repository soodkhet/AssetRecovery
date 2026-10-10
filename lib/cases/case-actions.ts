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
  /** ผลย้อนกลับไม่ได้ (ไปสถานะสุดท้าย) ⇒ ต้องเปิดกล่องยืนยันก่อนส่ง (preship R3-013 · Rule 05) */
  confirmRequired: boolean
}

/**
 * ชื่อปุ่มบน modal — `38` §7.5 เรียกบางปุ่มต่างจาก label กลางใน `CASE_STATUS_RULES`
 * (เช่น `accept` = "รับเคส & ยืนยันทีม" เพราะกดแล้วยืนยันทีมไปพร้อมกัน)
 */
const MODAL_LABEL: Partial<Record<CaseStatusAction, string>> = {
  accept: 'รับเคส & ยืนยันทีม',
  create_recycle_request: 'ขอรีไซเคิล (re-track)',
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

/**
 * action ที่ต้องเปิดกล่องยืนยันก่อน — `reject` (ไปสถานะสุดท้าย `rejected`) · `approve_recycle` (staging E-034 —
 * ขึ้นรอบติดตามใหม่และกลับเข้าคิวมอบหมายทันที ย้อนกลับไม่ได้)
 */
const CONFIRM_REQUIRED: ReadonlySet<CaseStatusAction> = new Set(['reject', 'approve_recycle'])

/** ข้อความกล่องยืนยันต่อ action (staging E-034) */
export const CASE_ACTION_CONFIRM: Partial<
  Record<CaseStatusAction, { title: string; description: string; confirmLabel: string; danger: boolean }>
> = {
  reject: {
    title: 'ไม่รับเคส',
    description:
      'เคสจะถูกปิดเป็น “ไม่รับเคส” ทันทีและย้อนกลับไม่ได้ — บริษัทไฟแนนซ์จะเห็นสถานะนี้พร้อมเหตุผล ถ้าต้องการให้แก้ข้อมูลแล้วส่งใหม่ ให้ใช้ “ขอข้อมูลเพิ่ม” แทน',
    confirmLabel: 'ยืนยันไม่รับเคส',
    danger: true,
  },
  approve_recycle: {
    title: 'อนุมัติรีไซเคิล',
    description:
      'เคสจะขึ้นรอบติดตามใหม่และกลับเข้าคิวมอบหมายทันที (ย้อนกลับไม่ได้) — ค่าบริการรอบใหม่บันทึกตามเทมเพลตปัจจุบัน',
    confirmLabel: 'ยืนยันอนุมัติรีไซเคิล',
    danger: false,
  },
}

/** ข้อความ toast เมื่อทำสำเร็จ (staging E-032 — เดิมต่อคำบนปุ่ม + "แล้ว" และใช้สีแดงกับปุ่มโทน danger) */
const SUCCESS_TOAST: Record<CaseStatusAction, string> = {
  review: 'ส่งตรวจเคสแล้ว',
  accept: 'รับเคสแล้ว',
  reject: 'บันทึกไม่รับเคสแล้ว',
  request_more_info: 'ส่งขอข้อมูลเพิ่มแล้ว',
  return_to_draft: 'กลับไปแก้ไขเป็นร่างแล้ว',
  create_recycle_request: 'ส่งคำขอรีไซเคิลแล้ว',
  approve_recycle: 'อนุมัติรีไซเคิลแล้ว',
  reject_recycle: 'บันทึกไม่อนุมัติรีไซเคิลแล้ว',
}

export function caseActionSuccessTitle(action: CaseStatusAction): string {
  return SUCCESS_TOAST[action]
}

/** คำบรรยายหัว modal ต่อโหมด (staging E-033 — โหมดอ่านอย่างเดียวที่ยังตีกลับหลักฐานได้ต้องไม่บอกว่า "แก้ไม่ได้") */
export function caseDetailDescription(mode: CaseDetailMode, options: { canRejectEvidence?: boolean } = {}): string {
  if (mode === 'review') return 'ตรวจข้อมูล เอกสาร และทีมที่ระบบเสนอ แล้วตัดสินใจได้ในหน้าเดียว'
  if (mode === 'recycle_review') return 'พิจารณาคำขอรีไซเคิล — อนุมัติแล้วเคสจะขึ้นรอบใหม่และกลับเข้าคิวมอบหมายทันที'
  if (mode === 'recycle_request') return 'เคสปิดแบบไม่สำเร็จ — ขอรีไซเคิลได้เมื่อไฟแนนซ์ต้องการให้ลองติดตามใหม่'
  if (options.canRejectEvidence === true) {
    return 'ตรวจหลักฐานปิดงาน — ตีกลับให้พนักงานส่งใหม่ได้ถ้าหลักฐานไม่น่าเชื่อถือ (ข้อมูลเคสแก้จากหน้านี้ไม่ได้)'
  }
  return 'ดูรายละเอียดเคส (สถานะนี้แก้ไขจากหน้านี้ไม่ได้)'
}

/** ป้ายช่องเหตุผล/หมายเหตุต่อโหมด (staging E-034) */
export function caseReasonFieldLabel(mode: CaseDetailMode): string {
  if (mode === 'review') return 'จำเป็นเมื่อไม่รับเคส หรือขอข้อมูลเพิ่ม'
  if (mode === 'recycle_review') return 'จำเป็นเมื่อไม่อนุมัติ · เมื่ออนุมัติจะบันทึกเป็นหมายเหตุผู้อนุมัติ'
  return 'จำเป็นสำหรับคำขอรีไซเคิล'
}

/** สถานะคำขอรีไซเคิลเป็นภาษาผู้ใช้ (staging E-032) */
export const RECYCLE_STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}

/** บรรทัดหัวประวัติรีไซเคิล — คำขอที่ยังรออนุมัติยังไม่มีเลขรอบ ⇒ ใช้รอบปัจจุบัน → รอบถัดไป (staging E-032) */
export function recycleHistoryLine(
  entry: { previousRound: number | null; newRound: number | null; status: string },
  currentRound: number,
): string {
  const from = entry.previousRound ?? currentRound
  const to = entry.newRound ?? (entry.status === 'rejected' ? null : from + 1)
  const status = RECYCLE_STATUS_LABEL[entry.status] ?? entry.status
  return to === null ? `รอบ ${from} · ${status}` : `รอบ ${from} → ${to} · ${status}`
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
    confirmRequired: CONFIRM_REQUIRED.has(action),
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

/**
 * ปุ่มเปิดรายละเอียดบนแถวชื่อ "พิจารณา" (เด่น) เฉพาะเคสที่รอการตัดสินใจ **และผู้ใช้กดตัดสินได้จริง**
 * — ธุรการเห็นปุ่ม "พิจารณา" แล้วเปิดไปไม่มีปุ่มตัดสินใจ (staging E-025) ⇒ คนอื่นเห็น "ดูรายละเอียด"
 */
export function caseRowOpensReview(status: string, can: (capability: string) => boolean): boolean {
  if (status !== 'pending_review' && status !== 'pending_recycle_review') return false
  return caseModalActions(status, can).length > 0
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
