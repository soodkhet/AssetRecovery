import { fmtDate } from '@/lib/format/datetime'
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

// ── Assignment (40 §11) ─────────────────────────────────────────────────────

export function reassignmentRequestedMessage(input: {
  caseRef: string
  reason?: string | null
  expiresAt: Date
}): NotificationMessage {
  return {
    eventCode: 'assignment.reassignment_requested',
    title: 'มีคำขอเปลี่ยนผู้รับผิดชอบ รอคำตอบของคุณ',
    body: withReason(`เคส ${input.caseRef} · ตอบภายใน ${fmtDate(input.expiresAt)}`, input.reason),
    linkPath: '/field/accepted',
  }
}

export function reassignmentTimeoutMessage(input: {
  caseRef: string
  pendingReassignmentId: string
}): NotificationMessage {
  return {
    eventCode: 'assignment.reassignment_timeout_resolved',
    title: 'คำขอเปลี่ยนผู้รับผิดชอบหมดเวลารอคำตอบ',
    body: `เคส ${input.caseRef} — ระบบมอบหมายให้พนักงานคนใหม่อัตโนมัติตาม \`40\` §11`,
    linkPath: '/cases/assign',
    // job รันซ้ำได้ ⇒ คีย์ต่อ "คำขอ" หนึ่งใบ (ผลลัพธ์เกิดครั้งเดียวเสมอ)
    dedupeKey: `pending-reassignment-${input.pendingReassignmentId}`,
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
    body: `เคส ${input.caseRef} ปิดงานสำเร็จ${by} · รายได้เกิดเมื่อคลังยืนยันรับทรัพย์ (\`19\` §6.1)`,
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
    body: `ยอด ${fmtSatangSymbol(input.grossSatang)}${scope} — รอเข้ารอบจ่าย`,
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
    linkPath: audience === 'payee' ? '/field/income' : '/finance?tab=advances',
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
    // job รันทุกวัน ⇒ คีย์ต่อ "งวด" หนึ่งงวด เตือนครั้งเดียวจนกว่าจะยื่น (`33` §8)
    dedupeKey: `wht-filing-${input.summaryId}`,
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
