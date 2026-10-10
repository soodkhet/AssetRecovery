import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { NotificationEventCode } from '@/lib/notifications/events'
import { WHT_FILING_METHOD_SUFFIX, type WhtFilingMethod } from '@/lib/settings/wht-policy'

/**
 * ข้อความของการแจ้งเตือนทุก event (`90` §6.3) — **pure ล้วน** ไม่มี Prisma/`next/*`
 *
 * แยกออกจากจุด emit เพื่อให้ทดสอบข้อความ + deep link ได้โดยไม่ต้องมี DB และเพื่อให้
 * "ข้อความเดียวกัน" ไม่ถูกเขียนซ้ำสองที่ (เช่น payout ที่ยืนยันได้ทั้งมือและจาก Bank Reconciliation)
 *
 * กติกาที่ยึดทั้งไฟล์:
 * - วันที่บนข้อความ = **พ.ศ.** ผ่าน `fmtDate()` เสมอ (Rule 01) · เงิน = satang → `fmtSatangSymbol()`
 * - `linkPath` เป็น path ภายในแอปเท่านั้น (กระดิ่งกรองซ้ำอีกชั้นด้วย `notificationHref()`)
 * - `dedupeKey` ใส่ให้เฉพาะเหตุการณ์ที่ผู้เรียกเป็น job/consumer (รันซ้ำได้) — ห้ามมีเวลาปัจจุบันในคีย์
 */

export interface NotificationMessage {
  eventCode: NotificationEventCode
  title: string
  body: string | null
  linkPath: string | null
  /** ไม่ระบุ = แจ้งใหม่ทุกครั้งที่เรียก (action ของผู้ใช้ที่กดได้ครั้งเดียวอยู่แล้ว) */
  dedupeKey?: string
}

/** ตัดข้อความยาว (เหตุผล/หมายเหตุ) ให้พอดีบรรทัดเดียวของ dropdown */
export function clip(text: string | null | undefined, max = 120): string | null {
  const value = text?.trim() ?? ''
  if (value === '') return null
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function withReason(base: string, reason: string | null | undefined): string {
  const clipped = clip(reason)
  return clipped === null ? base : `${base} — ${clipped}`
}

// ── Case Submission (38 §10) ────────────────────────────────────────────────

export type CaseDecisionEvent = Extract<
  NotificationEventCode,
  'case.approved' | 'case.rejected' | 'case.need_info_requested' | 'case.recycle_approved'
>

const CASE_DECISION_TITLE: Readonly<Record<CaseDecisionEvent, string>> = {
  'case.approved': 'เคสผ่านการอนุมัติ',
  'case.rejected': 'เคสถูกปฏิเสธ',
  'case.need_info_requested': 'ผู้ตรวจขอข้อมูลเพิ่มเติม',
  'case.recycle_approved': 'อนุมัติรีไซเกิลเคส',
}

export function caseDecisionMessage(
  event: CaseDecisionEvent,
  input: { caseId: string; caseRef: string; reason?: string | null },
): NotificationMessage {
  return {
    eventCode: event,
    title: CASE_DECISION_TITLE[event],
    body: withReason(`เคส ${input.caseRef}`, input.reason),
    // เปิดรายละเอียดเคสนั้นเลย ไม่ต้องค้นหาเอง (preship PS-032)
    linkPath: `/cases/submit?case=${input.caseId}`,
  }
}

// ── Assignment (40 §15 — มติ PO 03/10/2569 UAT Q17) ────────────────────────
//
// ลิงก์ต้องไปหน้าที่ "ผู้รับคนนั้น" เปิดได้จริง (UAT BUG-059): พนักงาน = หน้า Field Tracker ของตัวเอง
// (งานรอรับ `/field/pending` · เคสที่ถูกโอนออกอยู่แท็บปิดแล้ว `/field/closed`) · ผู้มอบหมาย = `/cases/assign`

/** ลิงก์ของพนักงานที่ "ได้งาน" — งานใหม่ทุกชนิดเข้าสถานะรอกดรับ */
const AGENT_NEW_WORK_PATH = '/field/pending'
/** ลิงก์ของพนักงานที่ "เสียงาน" — เคส `reassigned_away` แสดงในแท็บปิดแล้วพร้อมเหตุผล */
const AGENT_LOST_WORK_PATH = '/field/closed'
const ASSIGNER_PATH = '/cases/assign'

/** พนักงานได้รับมอบหมายเคสใหม่ (`assignment.created`) */
export function assignmentCreatedMessage(input: { caseRef: string; assignmentId: string }): NotificationMessage {
  return {
    eventCode: 'assignment.created',
    title: 'คุณได้รับมอบหมายเคสใหม่',
    body: `เคส ${input.caseRef} — กรุณากดรับงาน`,
    linkPath: AGENT_NEW_WORK_PATH,
    dedupeKey: `assignment-${input.assignmentId}`,
  }
}

/**
 * เปลี่ยนผู้รับผิดชอบทันที (`assignment.reassigned` — เคสที่ยังไม่กดรับ) แยกข้อความตามผู้รับ:
 * คนใหม่ = ได้งาน · คนเดิม = เคสถูกโอนออกพร้อมเหตุผล
 */
export function assignmentReassignedMessage(
  input: { caseRef: string; assignmentId: string; reason?: string | null },
  audience: 'new_agent' | 'previous_agent',
): NotificationMessage {
  if (audience === 'new_agent') {
    return {
      eventCode: 'assignment.reassigned',
      title: 'คุณได้รับมอบหมายเคส (โอนมาจากพนักงานคนอื่น)',
      body: `เคส ${input.caseRef} — กรุณากดรับงาน`,
      linkPath: AGENT_NEW_WORK_PATH,
      dedupeKey: `assignment-${input.assignmentId}`,
    }
  }
  return {
    eventCode: 'assignment.reassigned',
    title: 'เคสของคุณถูกโอนให้พนักงานคนอื่นแล้ว',
    body: withReason(`เคส ${input.caseRef}`, input.reason),
    linkPath: AGENT_LOST_WORK_PATH,
    dedupeKey: `assignment-${input.assignmentId}`,
  }
}

/** พนักงานกดรับงานแล้ว (`assignment.accepted`) — ถึงผู้มอบหมาย + ผู้จัดการ/หัวหน้าทีม */
export function assignmentAcceptedMessage(input: {
  caseRef: string
  assignmentId: string
  agentName: string | null
  acceptedAt: Date
}): NotificationMessage {
  const by = input.agentName === null ? 'พนักงาน' : input.agentName
  return {
    eventCode: 'assignment.accepted',
    title: 'พนักงานกดรับงานแล้ว',
    body: `เคส ${input.caseRef} — ${by} รับงานเมื่อ ${fmtDateTime(input.acceptedAt)}`,
    linkPath: ASSIGNER_PATH,
    dedupeKey: `assignment-accepted-${input.assignmentId}`,
  }
}

/** คำขอเปลี่ยนผู้รับผิดชอบถึงพนักงานคนเดิม — เวลาที่ต้องตอบแสดงทั้งวันและเวลา (UAT BUG-041) */
export function reassignmentRequestedMessage(input: {
  caseRef: string
  reason?: string | null
  expiresAt: Date
}): NotificationMessage {
  return {
    eventCode: 'assignment.reassignment_requested',
    title: 'มีคำขอเปลี่ยนผู้รับผิดชอบ รอคำตอบของคุณ',
    body: withReason(`เคส ${input.caseRef} · ตอบภายใน ${fmtDateTime(input.expiresAt)}`, input.reason),
    linkPath: '/field/accepted',
  }
}

/** ผลของคำขอเปลี่ยนผู้รับผิดชอบ — ผู้รับ 3 กลุ่มได้ข้อความ/ลิงก์ของตัวเอง (UAT BUG-059) */
export type ReassignmentAudience = 'new_agent' | 'previous_agent' | 'requester'

/** พนักงานคนเดิมตอบคำขอ (`assignment.reassignment_consented` / `_declined`) */
export function reassignmentRespondedMessage(
  input: {
    caseRef: string
    pendingReassignmentId: string
    decision: 'consent' | 'decline'
    declineReason?: string | null
  },
  audience: Exclude<ReassignmentAudience, 'previous_agent'>,
): NotificationMessage {
  const dedupeKey = `pending-reassignment-${input.pendingReassignmentId}`
  if (input.decision === 'decline') {
    return {
      eventCode: 'assignment.reassignment_declined',
      title: 'พนักงานไม่ยินยอมเปลี่ยนผู้รับผิดชอบ',
      body: withReason(`เคส ${input.caseRef} — เคสยังเป็นของพนักงานคนเดิม`, input.declineReason),
      linkPath: ASSIGNER_PATH,
      dedupeKey,
    }
  }
  if (audience === 'new_agent') {
    return {
      eventCode: 'assignment.reassignment_consented',
      title: 'คุณได้รับมอบหมายเคส (โอนมาจากพนักงานคนอื่น)',
      body: `เคส ${input.caseRef} — กรุณากดรับงาน`,
      linkPath: AGENT_NEW_WORK_PATH,
      dedupeKey,
    }
  }
  return {
    eventCode: 'assignment.reassignment_consented',
    title: 'พนักงานยินยอมเปลี่ยนผู้รับผิดชอบแล้ว',
    body: `เคส ${input.caseRef} — โอนให้พนักงานคนใหม่แล้ว รอกดรับงาน`,
    linkPath: ASSIGNER_PATH,
    dedupeKey,
  }
}

/** คำขอหมดเวลา — job โอนให้คนใหม่อัตโนมัติ (`assignment.reassignment_timeout_resolved`) */
export function reassignmentTimeoutMessage(
  input: { caseRef: string; pendingReassignmentId: string },
  audience: ReassignmentAudience,
): NotificationMessage {
  // job รันซ้ำได้ ⇒ คีย์ต่อ "คำขอ" หนึ่งใบ (dedupe แยกตามผู้รับอยู่แล้ว — `notificationDedupeId`)
  const dedupeKey = `pending-reassignment-${input.pendingReassignmentId}`
  const eventCode = 'assignment.reassignment_timeout_resolved'
  switch (audience) {
    case 'new_agent':
      return {
        eventCode,
        title: 'คุณได้รับมอบหมายเคสเพิ่ม',
        body: `เคส ${input.caseRef} — โอนมาให้คุณเพราะพนักงานคนเดิมไม่ตอบคำขอภายในเวลา กรุณากดรับงาน`,
        linkPath: AGENT_NEW_WORK_PATH,
        dedupeKey,
      }
    case 'previous_agent':
      return {
        eventCode,
        title: 'เคสถูกโอนให้พนักงานคนอื่นแล้ว',
        body: `เคส ${input.caseRef} — คุณไม่ได้ตอบคำขอเปลี่ยนผู้รับผิดชอบภายในเวลาที่กำหนด`,
        linkPath: AGENT_LOST_WORK_PATH,
        dedupeKey,
      }
    case 'requester':
      return {
        eventCode,
        title: 'คำขอเปลี่ยนผู้รับผิดชอบหมดเวลารอคำตอบ',
        body: `เคส ${input.caseRef} — ระบบโอนให้พนักงานคนใหม่อัตโนมัติแล้ว`,
        linkPath: ASSIGNER_PATH,
        dedupeKey,
      }
  }
}

// ── Field Tracker (41 §17.2) ────────────────────────────────────────────────

export function caseClosedSuccessMessage(input: {
  caseRef: string
  agentName: string | null
}): NotificationMessage {
  const by = input.agentName === null ? '' : ` โดย ${input.agentName}`
  return {
    eventCode: 'case.closed_success',
    title: 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง',
    body: `เคส ${input.caseRef} ปิดงานสำเร็จ${by} · รายได้เกิดเมื่อคลังยืนยันรับทรัพย์`,
    linkPath: '/warehouse',
  }
}

/**
 * ส่งหลักฐานปิดงานใหม่หลังถูกตีกลับ (UAT BUG-071) — **ข้อความแยก** จากตอนปิดงานครั้งแรก ไม่ส่ง
 * "ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง" ซ้ำ · ผู้เรียกส่งเฉพาะเมื่อทรัพย์ยังรอรับเข้าคลัง (สายสำเร็จ)
 */
export function caseCloseResubmittedMessage(input: {
  caseRef: string
  agentName: string | null
  outcome: 'closed_success' | 'closed_fail'
}): NotificationMessage {
  const by = input.agentName === null ? '' : ` โดย ${input.agentName}`
  const success = input.outcome === 'closed_success'
  return {
    eventCode: 'case.close_resubmitted',
    title: `ส่งหลักฐานใหม่แล้ว — ${input.caseRef}`,
    body: success
      ? `เคส ${input.caseRef} ส่งหลักฐานปิดงานใหม่${by} · ทรัพย์ยังรอรับเข้าคลัง`
      : `เคส ${input.caseRef} ส่งหลักฐานปิดงานไม่สำเร็จชุดใหม่${by}`,
    linkPath: success ? '/warehouse' : '/cases/assign',
  }
}

/**
 * ใครต้องรู้เมื่อส่งหลักฐานใหม่ (UAT BUG-071) — สายสำเร็จ = คลัง **เฉพาะเมื่อทรัพย์ยังรอรับเข้า**
 * (`pending_intake` / `intake_rejected` — รับเข้าไปแล้วไม่มีงานให้คลังทำต่อ) · สายไม่สำเร็จ = ผู้มอบหมายของทีม
 * คืน `null` = ไม่ต้องแจ้งใคร
 */
export function caseCloseResubmittedNotice(input: {
  caseRef: string
  agentName: string | null
  outcome: 'closed_success' | 'closed_fail'
  assetStatus: string | null
}): { capability: 'intake_asset' | 'assign_case'; message: NotificationMessage } | null {
  if (input.outcome === 'closed_success') {
    if (input.assetStatus !== 'pending_intake' && input.assetStatus !== 'intake_rejected') return null
    return { capability: 'intake_asset', message: caseCloseResubmittedMessage(input) }
  }
  return { capability: 'assign_case', message: caseCloseResubmittedMessage(input) }
}

export function caseClosedFailMessage(input: {
  caseRef: string
  agentName: string | null
}): NotificationMessage {
  const by = input.agentName === null ? '' : ` โดย ${input.agentName}`
  return {
    eventCode: 'case.closed_fail',
    title: 'ปิดงานไม่สำเร็จ',
    body: `เคส ${input.caseRef} ปิดงานไม่สำเร็จ${by} — พิจารณามอบหมายใหม่หรือรีไซเกิลเคส`,
    linkPath: '/cases/assign',
  }
}

/**
 * `90` §6.3 แถว 4 — หลักฐานปิดงานถูกตีกลับ ต้องบอกพนักงานคนที่ถือเคส
 * ลิงก์ไปแท็บ "กำลังติดตาม" ซึ่งเป็นที่อยู่ของเคส `needs_revision` (`fieldGroupOf()`) — รายละเอียดเคสของ
 * Field Tracker เป็น modal ไม่มีหน้า `/field/cases/:id` (เดิมลิงก์ไปที่นั่น = 404 · UAT BUG-049)
 */
export function evidenceRejectedMessage(input: { caseId: string; caseRef: string; reason: string }): NotificationMessage {
  return {
    eventCode: 'case.evidence_rejected',
    title: 'หลักฐานปิดงานถูกตีกลับ',
    body: withReason(`เคส ${input.caseRef}`, input.reason),
    // เปิดรายละเอียดเคสนั้นในแท็บเลย (preship PS-032)
    linkPath: `/field/tracking?case=${input.caseId}`,
  }
}

// ── Warehouse (44 §14) ──────────────────────────────────────────────────────

export function assetIntakeRejectedMessage(input: {
  caseRef: string
  reason: string
}): NotificationMessage {
  return {
    eventCode: 'asset.intake_rejected',
    title: 'คลังตีกลับการรับเข้า',
    body: withReason(`เคส ${input.caseRef}`, input.reason),
    linkPath: '/field/closed',
  }
}

/** staging E-042 — ผู้จัดการ/หัวหน้าทีมของเคส (ผู้ตรวจกรณี IMEI ไม่ตรง — `44` §5) ได้รับแจ้งด้วย · ลิงก์หน้าคลัง (เห็นเครื่องของทีม — U22) */
export function assetIntakeRejectedManagerMessage(input: {
  caseRef: string
  agentName: string | null
  reason: string
}): NotificationMessage {
  return {
    eventCode: 'asset.intake_rejected',
    title: 'คลังตีกลับการรับเข้า (เคสในทีม)',
    body: withReason(`เคส ${input.caseRef}${input.agentName === null ? '' : ` · ผู้รับผิดชอบ ${input.agentName}`}`, input.reason),
    linkPath: '/warehouse',
  }
}

export function lotConfirmedMessage(input: {
  lotId: string
  lotNumber: string
  companyName: string
  assetCount: number
  revenueCount: number
}): NotificationMessage {
  const revenue =
    input.revenueCount === 0
      ? 'ยังไม่เกิดรายได้ในล็อตนี้ (รออนุมัติค่าตอบแทน)'
      : `เกิดรายได้ ${input.revenueCount} รายการ รอวางบิล`
  return {
    eventCode: 'lot.confirmed',
    title: 'ยืนยันส่งมอบล็อตแล้ว',
    body: `${input.lotNumber} · ${input.companyName} · ${input.assetCount} เครื่อง — ${revenue}`,
    linkPath: '/finance?tab=revenue',
    // ยืนยันซ้ำไม่ได้อยู่แล้ว (`44` §11) — ใส่คีย์ไว้กันการเรียกซ้ำจากงาน sync ในอนาคต
    dedupeKey: `lot-${input.lotId}`,
  }
}

// ── Compensation / Claims (16 §9) ───────────────────────────────────────────

export function expenseApprovedMessage(input: {
  grossSatang: number
  caseRef: string | null
}): NotificationMessage {
  const scope = input.caseRef === null ? '' : ` (เคส ${input.caseRef})`
  return {
    eventCode: 'expense.approved',
    title: 'รายการเบิกผ่านอนุมัติครบทุกขั้น',
    // ยอดนี้เป็น **ก่อนหัก ณ ที่จ่าย** — ยอดโอนจริงหัก WHT ก่อน (`22` §6.9) ⇒ ต้องบอกให้ชัด
    // ไม่งั้นผู้รับเงินอ่านแล้วเข้าใจว่าจะได้เต็มจำนวน
    body: `ยอดก่อนหัก ณ ที่จ่าย ${fmtSatangSymbol(input.grossSatang)}${scope} — รอเข้ารอบจ่าย`,
    linkPath: '/field/income',
  }
}

/**
 * ตีกลับแล้วผู้เบิกต้องแก้ที่หน้าเบิก (ไม่ใช่หน้ารายได้ · UAT BUG-099) — เปิดขอบแท็บให้ตรงชนิดรายการ:
 * ผูกกับงานภาคสนาม (`assignment_id` ไม่ว่าง) = แท็บ "ผูกกับเคส" (ค่าเริ่มต้น) · ไม่ผูก = แท็บ "เบิกแยก"
 */
export function expenseRejectedMessage(input: {
  grossSatang: number
  reason: string
  caseBound: boolean
  /** ปฏิเสธถาวร (มติ PO U117) — ส่งใหม่ไม่ได้ */
  permanent?: boolean
}): NotificationMessage {
  return {
    eventCode: 'expense.rejected',
    title: input.permanent === true ? 'รายการเบิกถูกปฏิเสธ (ส่งใหม่ไม่ได้)' : 'รายการเบิกถูกตีกลับ',
    body: withReason(`ยอด ${fmtSatangSymbol(input.grossSatang)}`, input.reason),
    linkPath: input.caseBound ? '/field/expenses' : '/field/expenses?view=separate',
  }
}

// ── คิวอนุมัติ (มติ PO 05/10/2569 U29 · BUG-106) ──────────────────────────────
//
// แจ้ง "ผู้อนุมัติขั้นที่รออยู่" ทันทีที่รายการเข้าคิว/ขยับขั้น — ผู้รับ + การจัดกลุ่มอยู่ที่
// `lib/notifications/approval-queue.ts` · ที่นี่แค่ประกอบข้อความ (ชนิด · ผู้ขอ · ยอด) + ลิงก์ไปหน้าคิว
// `dedupeKey` มาจากผู้เรียกเสมอ (สถานะของรายการ ณ ขั้นนั้น — ไม่มีเวลาปัจจุบัน) ⇒ event ส่งซ้ำไม่แจ้งซ้ำ

/** ลิงก์คิวอนุมัติค่าตอบแทน — ผู้จัดการทีมเห็นแท็บนี้แท็บเดียวในหน้าการเงิน (มติ R6-A · UAT BUG-096) */
const COMP_QUEUE_PATH = '/finance?tab=comp'

/** รายการเบิก (ทุกแหล่ง) รออนุมัติขั้นของผู้รับ — 1 ข้อความต่อ (ผู้ขอ × ขั้น) ของเหตุการณ์เดียวกัน */
export function expenseApprovalRequestedMessage(input: {
  /** ชื่อชนิดภาษาไทย ไม่ซ้ำ ตามลำดับที่พบ (เช่น ค่าน้ำมัน, เบี้ยเลี้ยง) */
  typeLabels: readonly string[]
  requesterName: string
  count: number
  totalSatang: number
  step: number
  totalSteps: number
  caseRefs: readonly string[]
  dedupeKey: string
}): NotificationMessage {
  const types = input.typeLabels.join(', ')
  const cases =
    input.caseRefs.length === 0
      ? ''
      : input.caseRefs.length <= 2
        ? ` (เคส ${input.caseRefs.join(', ')})`
        : ` (เคส ${input.caseRefs.slice(0, 2).join(', ')} และอีก ${input.caseRefs.length - 2} เคส)`
  const step = input.totalSteps > 1 ? ` ขั้น ${input.step}/${input.totalSteps}` : ''
  return {
    eventCode: 'expense.approval_requested',
    title: `รายการเบิกรออนุมัติ${step}`,
    body: `${types} · ผู้ขอ ${input.requesterName} · ${input.count} รายการ รวม ${fmtSatangSymbol(input.totalSatang)}${cases}`,
    linkPath: COMP_QUEUE_PATH,
    dedupeKey: input.dedupeKey,
  }
}

/** คำขอเงินทดรองใหม่รออนุมัติ */
export function advanceApprovalRequestedMessage(input: {
  advanceId: string
  requesterName: string
  requestedSatang: number
  purpose: string
  dueClearDate: Date
}): NotificationMessage {
  return {
    eventCode: 'advance.approval_requested',
    title: 'คำขอเงินทดรองรออนุมัติ',
    body: withReason(
      `ผู้ขอ ${input.requesterName} · ยอด ${fmtSatangSymbol(input.requestedSatang)} · เคลียร์ภายใน ${fmtDate(input.dueClearDate)}`,
      input.purpose,
    ),
    linkPath: '/finance?tab=advances',
    dedupeKey: `advance-approval-${input.advanceId}`,
  }
}

/**
 * รายการปรับปรุงรออนุมัติจาก "บทบาทที่ยังขาด" (`20` §6.2) — รอบที่ต้องสองบทบาท แจ้งบทบาทแรกตอนสร้าง
 * แล้วแจ้งบทบาทถัดไปเมื่อบทบาทแรกอนุมัติ ⇒ คีย์กันซ้ำผูกกับชุดบทบาทที่รออยู่
 */
export function adjustmentApprovalRequestedMessage(input: {
  adjustmentId: string
  adjustmentTypeLabel: string
  amountSatang: number
  targetLabel: string
  requesterName: string
  waitingRoles: readonly string[]
}): NotificationMessage {
  return {
    eventCode: 'adjustment.approval_requested',
    title: 'รายการปรับปรุงรออนุมัติ',
    body: `${input.adjustmentTypeLabel} ${fmtSatangSymbol(input.amountSatang)} · ${input.targetLabel} · ผู้ขอ ${input.requesterName} — รออนุมัติจาก ${input.waitingRoles.join(' + ')}`,
    linkPath: '/finance?tab=adjustment',
    dedupeKey: `adjustment-approval-${input.adjustmentId}-${[...input.waitingRoles].sort().join('+')}`,
  }
}

// ── job รายวัน — วันที่อยู่ในงวดปิดแล้ว (มติ PO 05/10/2569 U25 · BUG-093) ───────

/**
 * job `daily_field_allowance` ข้ามวันที่อยู่ในงวดบัญชีที่ปิดแล้ว (ไม่ settle ข้ามงวด) ⇒ แจ้งการเงิน + บัญชี
 * (มติ PO 05/10/2569 U25 · U50) พร้อมยอดที่คำนวณไว้ (`planFieldDayExpenses()` สูตรเดียวกับวันปกติ)
 * · การเงิน: ลิงก์ไปแท็บปรับปรุง ที่มีปุ่ม "สร้างรายการเบิกย้อนหลัง" (ลงวันที่ในงวดที่เปิดอยู่ → สายอนุมัติปกติ)
 * · บัญชี: รับทราบว่ารายการจะลงงวดที่เปิดอยู่ ไม่แก้งวดที่ปิด
 * · 1 พนักงาน × 1 วัน = 1 การแจ้งเตือนต่อผู้รับ — job รันซ้ำทุกคืนก็ไม่แจ้งซ้ำ (คีย์ไม่มีเวลาปัจจุบัน)
 */
export function fieldAllowancePeriodLockedMessage(
  input: {
    agentId: string
    agentName: string
    fieldDate: Date
    caseCount: number
    fuelSatang: number
    allowanceSatang: number
  },
  audience: 'finance' | 'accounting' = 'finance',
): NotificationMessage {
  const total = input.fuelSatang + input.allowanceSatang
  const summary =
    `วันที่ ${fmtDate(input.fieldDate)} คำนวณเข้างวดไม่ได้เพราะงวดบัญชีปิดแล้ว — ${input.agentName} ${input.caseCount} เคส ` +
    `ค่าน้ำมัน ${fmtSatangSymbol(input.fuelSatang)} เบี้ยเลี้ยง ${fmtSatangSymbol(input.allowanceSatang)} ` +
    `รวม ${fmtSatangSymbol(total)}`
  return {
    eventCode: 'field_allowance.period_locked',
    title: 'ค่าน้ำมัน/เบี้ยเลี้ยงรายวันเข้างวดที่ปิดแล้วไม่ได้',
    body:
      audience === 'finance'
        ? `${summary} — กด "สร้างรายการเบิกย้อนหลัง" เพื่อลงรายการในงวดที่เปิดอยู่แล้วส่งเข้าสายอนุมัติ`
        : `${summary} — ฝ่ายการเงินจะสร้างรายการเบิกย้อนหลังลงในงวดที่เปิดอยู่ (งวดที่ปิดไม่ถูกแก้)`,
    linkPath: audience === 'finance' ? '/finance?tab=adjustment' : '/accounting?tab=closing',
    dedupeKey: `field-day-locked-${input.agentId}-${input.fieldDate.toISOString().slice(0, 10)}`,
  }
}

/**
 * มติ PO U135 — ค่าน้ำมันตามระยะทาง (`PER_KM`) คำนวณได้หลังงวดของวันปิดงานปิดแล้ว ⇒ ไม่เขียนเข้างวดนั้น
 * ใช้ event เดียวกับรายการรายวัน (`field_allowance.period_locked` — ค่าน้ำมัน/เบี้ยเลี้ยงลงงวดที่ปิดไม่ได้)
 */
export function fuelPeriodLockedMessage(
  input: { assignmentId: string; agentName: string; caseRef: string; workDate: Date; grossSatang: number },
  audience: 'finance' | 'accounting' = 'finance',
): NotificationMessage {
  const summary =
    `ค่าน้ำมันตามระยะทางของเคส ${input.caseRef} (${input.agentName}) ปิดงานวันที่ ${fmtDate(input.workDate)} ` +
    `ยอด ${fmtSatangSymbol(input.grossSatang)} คำนวณได้หลังงวดบัญชีปิดแล้ว`
  return {
    eventCode: 'field_allowance.period_locked',
    title: 'ค่าน้ำมันตามระยะทางเข้างวดที่ปิดแล้วไม่ได้',
    body:
      audience === 'finance'
        ? `${summary} — กด "สร้างรายการเบิกย้อนหลัง" เพื่อลงรายการในงวดที่เปิดอยู่แล้วส่งเข้าสายอนุมัติ`
        : `${summary} — ฝ่ายการเงินจะสร้างรายการเบิกย้อนหลังลงในงวดที่เปิดอยู่ (งวดที่ปิดไม่ถูกแก้)`,
    linkPath: audience === 'finance' ? '/finance?tab=adjustment' : '/accounting?tab=closing',
    dedupeKey: `fuel-locked-${input.assignmentId}`,
  }
}

// ── Payout (17 §9) ──────────────────────────────────────────────────────────

export function payoutBatchCompletedMessage(input: {
  batchId: string
  batchName: string
  netSatang: number
  source: 'manual' | 'bank_reconciliation'
}): NotificationMessage {
  const via = input.source === 'manual' ? 'ยืนยันด้วยมือ' : 'จับคู่รายการเดินบัญชีอัตโนมัติ'
  return {
    eventCode: 'payout_batch.completed',
    title: 'รอบจ่ายโอนเงินสำเร็จ',
    body: `${input.batchName} · ยอดสุทธิ ${fmtSatangSymbol(input.netSatang)} (${via})`,
    linkPath: '/finance?tab=payout',
    // ทางเข้าจาก Bank Reconciliation เป็น consumer (รันซ้ำได้) ⇒ ต้องมีคีย์เสมอ
    dedupeKey: `payout-${input.batchId}`,
  }
}

/**
 * แจ้งผู้รับเงินแต่ละคนว่าโอนเงินแล้ว (staging E-011 · `90` §6.3 v4.9) — ยอด = ยอดโอนจริงของคนนั้นในรอบ
 * (หลังหักภาษีและหักคืนเงินทดรอง) · กันซ้ำต่อรอบ+ผู้รับ (ทางเข้าจาก Bank Reconciliation รันซ้ำได้)
 */
export function payoutPaidToPayeeMessage(input: {
  batchId: string
  userId: string
  transferSatang: number
}): NotificationMessage {
  return {
    eventCode: 'payout.paid_to_payee',
    title: 'โอนค่าตอบแทนเข้าบัญชีแล้ว',
    body: `ยอดโอนสุทธิ ${fmtSatangSymbol(input.transferSatang)} — ตรวจรายการได้ที่หน้าสรุปรายได้`,
    linkPath: '/field/income',
    dedupeKey: `payout-paid-${input.batchId}-${input.userId}`,
  }
}

// ── Advance (15 §9.1 — job) ─────────────────────────────────────────────────

/** การเงินตีกลับการเคลียร์ยอดเงินทดรอง — ผู้ขอต้องเคลียร์ใหม่ (staging E-012 · `90` §6.3 v4.9) */
export function advanceClearReopenedMessage(input: {
  advanceId: string
  advanceNumber: string
  reason: string
}): NotificationMessage {
  return {
    eventCode: 'advance.clear_reopened',
    title: 'การเงินตีกลับการเคลียร์เงินทดรอง',
    body: withReason(`${input.advanceNumber} — เคลียร์ยอดใหม่อีกครั้ง`, input.reason),
    linkPath: '/field/advances',
  }
}

/** การเงินพิจารณาคำขอเงินทดรองแล้ว — แจ้งผู้ขอ (staging E-011 · `90` §6.3 v4.9) */
export function advanceDecidedMessage(
  input: {
    advanceId: string
    approvedSatang: number | null
    requestedSatang: number
    dueClearDate: Date
    reason: string | null
  },
  decision: 'approved' | 'rejected',
): NotificationMessage {
  if (decision === 'rejected') {
    return {
      eventCode: 'advance.rejected',
      title: 'คำขอเงินทดรองไม่ได้รับอนุมัติ',
      body: withReason(`ยอดที่ขอ ${fmtSatangSymbol(input.requestedSatang)}`, input.reason),
      linkPath: '/field/advances',
    }
  }
  const approved = input.approvedSatang ?? input.requestedSatang
  const reduced = approved < input.requestedSatang ? ` (ขอ ${fmtSatangSymbol(input.requestedSatang)})` : ''
  return {
    eventCode: 'advance.approved',
    title: 'อนุมัติเงินทดรองแล้ว',
    body: withReason(
      `อนุมัติ ${fmtSatangSymbol(approved)}${reduced} · โอนในรอบจ่ายถัดไป · เคลียร์ยอดภายใน ${fmtDate(input.dueClearDate)}`,
      input.reason,
    ),
    linkPath: '/field/advances',
  }
}

/**
 * ผู้รับมีสองฝั่ง (`15` §9.1): **ผู้ยืม** เห็นจากหน้าจอ Field · **การเงิน** เห็นจากแท็บเงินทดรองจ่าย
 * — ข้อความเดียวกัน ต่างกันแค่ปลายทางของลิงก์ (ใช้คีย์กันซ้ำตัวเดียวกันได้ เพราะ id กันซ้ำผูกกับผู้รับด้วย)
 */
export function advanceOverdueMessage(
  input: { advanceId: string; dueClearDate: Date },
  audience: 'payee' | 'finance',
): NotificationMessage {
  return {
    eventCode: 'advance.overdue',
    title: 'เงินทดรองเลยกำหนดเคลียร์',
    body: `ครบกำหนดเคลียร์ยอดวันที่ ${fmtDate(input.dueClearDate)} — ระบบมาร์คเป็นเลยกำหนดแล้ว`,
    // ผู้ยืมไปหน้าเงินทดรองของตัวเองใน Field Tracker (มีหน้าแล้วตั้งแต่ UAT BUG-046)
    linkPath: audience === 'payee' ? '/field/advances' : '/finance?tab=advances',
    dedupeKey: `advance-${input.advanceId}`,
  }
}

// ── Accounting (30/33/34/36) ────────────────────────────────────────────────

export function exceptionCreatedMessage(input: {
  title: string
  periodLabel: string
}): NotificationMessage {
  return {
    eventCode: 'exception.created',
    title: 'ข้อยกเว้นระดับ critical ใหม่',
    // ข้อความที่ผู้ใช้เห็นห้ามมีเลขอ้างอิงสเปค (Rule 05 · preship R9-017) — เดิมต่อท้าย "(`37`)" · ที่มา: `37` export gate
    body: `งวด ${input.periodLabel} · ${clip(input.title) ?? '-'} — ต้องเคลียร์ก่อนส่งงวดให้สำนักงานบัญชี`,
    linkPath: '/accounting?tab=documents',
  }
}

/**
 * "ขั้นของการเตือน" ที่คำนวณซ้ำได้จาก `daysLeft` — เป็นส่วนหนึ่งของ dedupe key
 *
 * ⚠️ ถ้าคีย์เป็น `wht-filing-<summaryId>` เฉย ๆ job รายวันจะเตือน **ครั้งเดียวตลอดชีพของงวด**
 * ⇒ สาขา "ครบกำหนดวันนี้" / "เลยกำหนด" ไม่มีวันถึงผู้ใช้ ทั้งที่พลาดกำหนดมีโทษปรับจริง (`33` §6.2)
 * ⇒ แบ่งขั้นแทน: ก่อนกำหนดวันละครั้ง (อยู่ในหน้าต่าง 5 วัน) · วันครบกำหนดหนึ่งครั้ง · เลยกำหนดสัปดาห์ละครั้ง
 * — ยังคำนวณซ้ำได้จากข้อมูลล้วน ไม่ใช้เวลาปัจจุบันดิบ (กติกาของ `lib/notifications/dedupe.ts`)
 */
export function whtFilingReminderStage(daysLeft: number): string {
  if (daysLeft > 0) return `d${daysLeft}`
  if (daysLeft === 0) return 'd0'
  return `overdue-w${Math.floor((Math.abs(daysLeft) - 1) / 7) + 1}`
}

/**
 * มติ PO 07/10/2569 U127 — ยกเลิก/ออกใบ 50 ทวิ ในเดือนที่ยื่น ภ.ง.ด. แล้ว ⇒ บัญชีต้องยื่นเพิ่มเติม
 * คีย์ = รอบ + ใบ + การกระทำ ⇒ เหตุการณ์เดียวกันไม่แจ้งซ้ำ แต่ใบใหม่/การยกเลิกครั้งต่อไปแจ้งใหม่
 */
export function whtSupplementaryFilingMessage(input: {
  summaryId: string
  periodLabel: string
  certificateNumber: string
  action: 'cancelled' | 'issued'
}): NotificationMessage {
  const what = input.action === 'cancelled' ? 'ยกเลิก' : 'ออก'
  return {
    eventCode: 'wht.supplementary_filing_required',
    title: 'ต้องยื่น ภ.ง.ด. เพิ่มเติม',
    body: `งวด ${input.periodLabel} ยื่นแบบไปแล้ว แต่มีการ${what}หนังสือรับรอง ${input.certificateNumber} ภายหลัง — ตรวจยอดต่างแล้วยื่นเพิ่มเติม`,
    linkPath: '/accounting?tab=wht',
    dedupeKey: `wht-supplementary-${input.summaryId}-${input.action}-${input.certificateNumber}`,
  }
}

export function whtFilingDueMessage(input: {
  summaryId: string
  periodLabel: string
  filingDueDate: Date
  /** วิธียื่นที่ใช้คิดกำหนด (มติ PO U45) — ไม่ส่ง = ออนไลน์ */
  filingMethod?: WhtFilingMethod
  daysLeft: number
}): NotificationMessage {
  const countdown =
    input.daysLeft < 0
      ? `เลยกำหนดมาแล้ว ${Math.abs(input.daysLeft)} วัน`
      : input.daysLeft === 0
        ? 'ครบกำหนดวันนี้'
        : `เหลือ ${input.daysLeft} วัน`
  return {
    eventCode: 'wht.filing_due_reminder',
    title: 'ใกล้ครบกำหนดยื่น ภ.ง.ด.3/53',
    body: `งวด ${input.periodLabel} · กำหนดนำส่ง ${fmtDate(input.filingDueDate)} ${WHT_FILING_METHOD_SUFFIX[input.filingMethod ?? 'online']} (${countdown})`,
    linkPath: '/accounting?tab=wht',
    // job รันทุกวัน ⇒ คีย์ = งวด + ขั้นของการเตือน (ดู `whtFilingReminderStage()`)
    // รันซ้ำวันเดียวกันได้แถวเดียว · วันถัดไปได้ใบใหม่จนกว่าจะยื่น (`33` §6.2/§8)
    dedupeKey: `wht-filing-${input.summaryId}-${whtFilingReminderStage(input.daysLeft)}`,
  }
}

export function accountantQuestionMessage(input: {
  periodLabel: string
  questionText: string
}): NotificationMessage {
  return {
    eventCode: 'question.asked',
    title: 'ข้อซักถามใหม่จากสำนักงานบัญชี',
    body: `งวด ${input.periodLabel} · ${clip(input.questionText) ?? '-'}`,
    linkPath: '/accounting?tab=qa',
  }
}

export function periodSentToAccountantMessage(input: {
  periodId: string
  periodLabel: string
}): NotificationMessage {
  return {
    eventCode: 'period.sent_to_accountant',
    title: 'ส่งงวดบัญชีให้สำนักงานบัญชีแล้ว',
    body: `งวด ${input.periodLabel} — รอสำนักงานบัญชีตรวจและซักถาม`,
    linkPath: '/accounting?tab=closing',
    dedupeKey: `period-sent-${input.periodId}`,
  }
}

/**
 * มติ PO 07/10/2569 U167 — job อัปเดตฐาน TAC ล้มเหลว ⇒ แจ้งผู้ดูแล Model Phone
 * คีย์ = วันไทย ⇒ retry หลายรอบในวันเดียวกันแจ้งครั้งเดียว · วันถัดไปที่ยังล้มแจ้งใหม่
 */
export function deviceTacUpdateFailedMessage(input: { jobRef: string; dayKey: string; reason: string }): NotificationMessage {
  return {
    eventCode: 'device_catalog.tac_update_failed',
    title: 'อัปเดตฐานยี่ห้อ/รุ่นจาก IMEI ไม่สำเร็จ',
    body: withReason('ระบบจะลองใหม่อัตโนมัติ ตัวเลือกยี่ห้อ/รุ่นเดิมยังใช้ได้', input.reason),
    linkPath: '/settings/device-catalog',
    dedupeKey: `device-tac-update-failed-${input.dayKey}`,
  }
}
