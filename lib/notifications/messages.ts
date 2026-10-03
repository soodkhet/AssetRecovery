import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { NotificationEventCode } from '@/lib/notifications/events'

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
    linkPath: '/cases/submit',
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
    linkPath: '/field/tracking',
  }
}

/** `41` §15 — รายการเบิกที่เข้า `pending_approval` หลังปิดงานไม่สำเร็จ */
export function expenseQueueMessage(input: { caseRef: string; count: number }): NotificationMessage {
  return {
    eventCode: 'expense.case_bound_created',
    title: 'มีรายการเบิกใหม่รออนุมัติ',
    body: `เคส ${input.caseRef} ปิดงานไม่สำเร็จ — มีรายการเบิก ${input.count} รายการเข้าคิวอนุมัติ`,
    linkPath: '/finance/approvals',
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

export function expenseRejectedMessage(input: {
  grossSatang: number
  reason: string
}): NotificationMessage {
  return {
    eventCode: 'expense.rejected',
    title: 'รายการเบิกถูกตีกลับ',
    body: withReason(`ยอด ${fmtSatangSymbol(input.grossSatang)}`, input.reason),
    linkPath: '/field/income',
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

// ── Advance (15 §9.1 — job) ─────────────────────────────────────────────────

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
    body: `งวด ${input.periodLabel} · ${clip(input.title) ?? '-'} — ต้องเคลียร์ก่อนส่งงวด (\`37\`)`,
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

export function whtFilingDueMessage(input: {
  summaryId: string
  periodLabel: string
  filingDueDate: Date
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
    body: `งวด ${input.periodLabel} · กำหนดนำส่ง ${fmtDate(input.filingDueDate)} (${countdown})`,
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
