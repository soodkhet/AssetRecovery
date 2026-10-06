import { AdvanceError } from '@/lib/advances/errors'
import { toInputDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type {
  AdvanceReturnChannel,
  AdvanceReturnMethod,
  AdvanceStatus,
  ExpenseType,
  PayoutBatchStatus,
} from '@/lib/generated/prisma/enums'

/**
 * เงินทดรองจ่าย — state machine + กติกาธุรกิจ (`15` · `23` §6.4) — **pure ล้วน ไม่มี I/O**
 * ใช้ร่วม FE/BE — หน้าจอห้าม `if` สถานะเอง (Rule 05)
 *
 * ```
 * pending_approval → approved        (approve — "อนุมัติแล้ว = เงินออกแล้ว = รอเคลียร์" ในตัว)
 * pending_approval → rejected        (reject + rejection_reason, terminal)
 * approved         → overdue         (mark_overdue — background job เท่านั้น ไม่มีปุ่มให้ผู้ใช้กด `15` §10)
 * approved|overdue → cleared         (settle, terminal)
 * ```
 *
 * ⚠️ **ยอดคืน (`return_satang`) เป็น generated column ของ DB** — ห้ามเขียนค่าเอง
 * (สูตร/ยาม อยู่ที่ `lib/finance/advance-calc.ts` ของ Phase 3.1 ห้ามคำนวณซ้ำที่นี่)
 */

export const ADVANCE_ACTIONS = ['approve', 'reject', 'mark_overdue', 'settle'] as const
export type AdvanceAction = (typeof ADVANCE_ACTIONS)[number]

const TRANSITIONS: Readonly<Record<AdvanceAction, { from: readonly AdvanceStatus[]; to: AdvanceStatus }>> = {
  approve: { from: ['pending_approval'], to: 'approved' },
  reject: { from: ['pending_approval'], to: 'rejected' },
  // `15` §10 — auto-mark โดย background job เท่านั้น (ไม่มี endpoint ให้ user เรียก)
  mark_overdue: { from: ['approved'], to: 'overdue' },
  settle: { from: ['approved', 'overdue'], to: 'cleared' },
}

/**
 * สถานะที่ถือว่า "ยังไม่เคลียร์" — **บล็อกการขอรอบใหม่เหมือนกันทั้งคู่** (`15` §9.2 · `24` §6.4)
 * ตรงกับ partial unique `uniq_active_advance_per_payee` ระดับ DB (`02` §6)
 */
export const UNCLEARED_ADVANCE_STATUSES: readonly AdvanceStatus[] = ['approved', 'overdue']

/** สถานะที่จบแล้ว ไม่มี action ต่อ */
export const TERMINAL_ADVANCE_STATUSES: readonly AdvanceStatus[] = ['cleared', 'rejected']

/** ปลายทางของ action — สถานะปัจจุบันทำไม่ได้ = `ADVANCE_INVALID_STATUS` */
export function nextAdvanceStatus(current: AdvanceStatus, action: AdvanceAction): AdvanceStatus {
  const rule = TRANSITIONS[action]
  if (!rule.from.includes(current)) {
    throw new AdvanceError('ADVANCE_INVALID_STATUS', {
      context: { status: current, action },
      detail: `action ${action} ทำได้จากสถานะ ${rule.from.join('|')} เท่านั้น`,
    })
  }
  return rule.to
}

export function canAdvanceAction(current: AdvanceStatus, action: AdvanceAction): boolean {
  return TRANSITIONS[action].from.includes(current)
}

/**
 * `15` §9.2 — ห้ามเบิกซ้อน: มีรายการ `approved`/`overdue` ค้างอยู่ = ขอใหม่ไม่ได้
 * @param existing รายการที่ยังไม่เคลียร์ของ payee คนนั้น (`null` = ไม่มี) — ผู้เรียกดึงจาก DB มาให้
 */
export function assertNoUnclearedAdvance(
  existing: { id: string; status: AdvanceStatus } | null,
): void {
  if (existing === null) return
  throw new AdvanceError('ADVANCE_PENDING_SETTLEMENT', {
    detail: `advance=${existing.id} status=${existing.status}`,
    context: { advanceId: existing.id, status: existing.status },
  })
}

/**
 * `15` §11 · `13` §6.2.1 — เพดานยอดต่อครั้ง · `null` = ไม่จำกัด (**ไม่ตรวจข้อนี้เลย**)
 */
export function assertWithinAdvanceMax(requestedSatang: number, maxSatang: number | null): void {
  if (maxSatang === null) return
  if (requestedSatang > maxSatang) {
    throw new AdvanceError('ADVANCE_EXCEEDS_MAX', {
      detail: `requested=${requestedSatang} max=${maxSatang}`,
      context: { requestedSatang, maxSatang },
    })
  }
}

/** `15` §11 `REJECTION_REASON_REQUIRED` — ปฏิเสธต้องมีเหตุผลเสมอ (Rule 04) */
export function assertAdvanceRejectionReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed.length < 5) throw new AdvanceError('REJECTION_REASON_REQUIRED')
  return trimmed
}

/**
 * ยอดที่อนุมัติจริง — การเงินปรับลดได้ (`02` §5 แยกคอลัมน์ `approved_satang` ออกจาก `requested_satang`)
 * ไม่ระบุ = อนุมัติเต็มจำนวนที่ขอ · **ห้ามอนุมัติเกินยอดที่ขอ** (ยอดเกินต้องขอใหม่ ไม่ใช่ผู้อนุมัติเพิ่มให้เอง)
 */
export function resolveApprovedSatang(requestedSatang: number, approvedSatang: number | null | undefined): number {
  if (approvedSatang === null || approvedSatang === undefined) return requestedSatang
  if (approvedSatang > requestedSatang) {
    throw new AdvanceError('ADVANCE_INVALID_STATUS', {
      detail: `approved=${approvedSatang} > requested=${requestedSatang}`,
      context: { requestedSatang, approvedSatang },
    })
  }
  return approvedSatang
}

/**
 * เลยกำหนดเคลียร์ยอดหรือยัง — เทียบ **วันตามปฏิทินไทย** (Rule 01)
 * `dueClearDate` เป็นคอลัมน์ `DATE` (เที่ยงคืน UTC) จึงเทียบเป็นสตริง `YYYY-MM-DD` ตรง ๆ
 * @param now เวลาปัจจุบัน — รับเข้ามาเสมอเพื่อให้เทสต์ได้และไม่เพี้ยนข้ามเขตเวลา
 */
export function isAdvanceOverdue(dueClearDate: Date | string, now: Date): boolean {
  const due = typeof dueClearDate === 'string' ? dueClearDate.slice(0, 10) : dueClearDate.toISOString().slice(0, 10)
  return due < toInputDate(now)
}

/**
 * มติ PO 03/10/2569 (UAT Q8, BUG-058) — ตอนขอเบิก กำหนดเคลียร์ยอดต้อง **ไม่ก่อนวันนี้** (ปฏิทินไทย)
 * วันนี้ยังได้ (UAT ADV3 ใช้วันครบกำหนด = วันที่ขอ แล้วรอข้ามวันจึงเป็น overdue) — เกณฑ์เดียวกับ
 * `isAdvanceOverdue()` เพื่อไม่ให้ "สร้างมาก็เกินกำหนดทันที"
 */
export function isDueClearDateInPast(dueClearDate: Date | string, now: Date): boolean {
  return isAdvanceOverdue(dueClearDate, now)
}

/** ค่า `min` ของช่อง `<input type="date">` กำหนดเคลียร์ยอด — วันนี้ตามเวลาไทย (ISO ค.ศ. ตามข้อยกเว้นของ browser) */
export function minDueClearInputDate(now: Date): string {
  return toInputDate(now)
}

/**
 * ชื่อ capability ของไฟล์ 15 (`25` §7.2) — วางไว้ในโมดูล pure เพื่อให้ **หน้าจอ client import ได้**
 * โดยไม่ลาก Prisma เข้า bundle (กับดักเดียวกับ `types.ts` — ดู REUSE_INDEX)
 */
export const REQUEST_ADVANCE = 'request_advance'
export const APPROVE_ADVANCE = 'approve_advance'

/**
 * คำขอเบิกส่วนเกินอัตโนมัติตอนเคลียร์ยอด (มติ PO 03/10/2569 — UAT Q3, BUG-011 · `15` §9.1 · `22` §6.13)
 * ใช้ค่า `manual` ของ `expense_type` (`02` §3) — ไม่สร้าง enum ใหม่ · เข้าคิวอนุมัติสายเดียวกับ Manual Claim
 */
export const ADVANCE_EXCESS_CLAIM_TYPE: ExpenseType = 'manual'

/** หมายเหตุของคำขอเบิกส่วนเกิน — บอกที่มาให้ผู้อนุมัติเห็นโดยไม่ต้องเปิด audit */
export function advanceExcessClaimNote(input: { purpose: string; approvedSatang: number; usedSatang: number }): string {
  const note = `เบิกส่วนเกินเงินทดรองอัตโนมัติ (ใช้จริง ${fmtSatangSymbol(input.usedSatang)} เกินยอดอนุมัติ ${fmtSatangSymbol(input.approvedSatang)}) — ${input.purpose}`
  return note.length > 500 ? `${note.slice(0, 499)}…` : note
}

// ── ยอดคืนเงินทดรอง (มติ PO 05/10/2569 UAT U30 · BUG-109 · `15` §9.3) ─────────────

/** วิธีคืนค่าเริ่มต้นตามมติ U30 — หักกลบในรอบจ่ายถัดไปของผู้รับ */
export const DEFAULT_ADVANCE_RETURN_METHOD: AdvanceReturnMethod = 'payout_offset'

/**
 * วิธีคืนที่บันทึกตอนเคลียร์ยอด — ไม่มียอดคืน ⇒ `null` (ไม่มีอะไรต้องปิด · CHECK
 * `chk_advances_return_method_shape`) · มียอดคืนแต่ไม่ระบุ ⇒ ค่าเริ่มต้น "หักกลบ"
 */
export function resolveSettleReturnMethod(
  returnSatang: number,
  requested: AdvanceReturnMethod | null | undefined,
): AdvanceReturnMethod | null {
  if (returnSatang <= 0) return null
  return requested ?? DEFAULT_ADVANCE_RETURN_METHOD
}

/**
 * เปลี่ยนวิธีคืน (การเงิน · เหตุผล + audit) — ทำได้เฉพาะเงินทดรองที่เคลียร์แล้วและ **ยังมียอดค้าง**
 * (ยอดที่ถูกหักในรอบจ่ายที่สร้างแล้วไม่นับเป็นค้าง ⇒ "เปลี่ยนก่อนรอบจ่ายที่จะหักถูกสร้าง" โดยปริยาย)
 */
export function assertCanChangeReturnMethod(input: {
  status: AdvanceStatus
  current: AdvanceReturnMethod | null
  target: AdvanceReturnMethod
  outstandingSatang: number
}): void {
  if (input.status !== 'cleared' || input.current === null || input.outstandingSatang <= 0) {
    throw new AdvanceError('ADVANCE_INVALID_STATUS', {
      detail: `เปลี่ยนวิธีคืนไม่ได้: status=${input.status} method=${input.current ?? 'none'} outstanding=${input.outstandingSatang}`,
      context: { status: input.status, returnMethod: input.current, outstandingSatang: input.outstandingSatang },
    })
  }
  if (input.current === input.target) {
    throw new AdvanceError('ADVANCE_INVALID_STATUS', {
      detail: `วิธีคืนเป็น ${input.target} อยู่แล้ว`,
      context: { returnMethod: input.current },
    })
  }
}

/**
 * รับคืนแยก — ต้องเลือกวิธี "รับคืนแยก" ไว้ก่อน (เปลี่ยนวิธีต้องมีเหตุผล) · ยอดไม่เกินยอดค้าง
 * (ยอดค้าง 0 ⇒ ปิดยอดแล้ว — รับซ้ำไม่ได้)
 */
export function assertSeparateReturnAllowed(input: {
  status: AdvanceStatus
  method: AdvanceReturnMethod | null
  outstandingSatang: number
  amountSatang: number
}): void {
  if (input.status !== 'cleared' || input.method !== 'separate' || input.outstandingSatang <= 0) {
    throw new AdvanceError('ADVANCE_INVALID_STATUS', {
      detail: `รับคืนแยกไม่ได้: status=${input.status} method=${input.method ?? 'none'} outstanding=${input.outstandingSatang}`,
      context: { status: input.status, returnMethod: input.method, outstandingSatang: input.outstandingSatang },
    })
  }
  if (input.amountSatang > input.outstandingSatang) {
    throw new AdvanceError('ADVANCE_RETURN_EXCEEDS_OUTSTANDING', {
      detail: `amount=${input.amountSatang} outstanding=${input.outstandingSatang}`,
      context: { amountSatang: input.amountSatang, outstandingSatang: input.outstandingSatang },
    })
  }
}

/** สถานะการคืนยอด (ค่าที่อนุมานได้ — **ไม่ใช่ state ใหม่ของ `advance_status`**) */
export type AdvanceReturnState = 'none' | 'pending_offset' | 'pending_separate' | 'closed'

export function advanceReturnState(input: {
  returnSatang: number
  outstandingSatang: number
  method: AdvanceReturnMethod | null
}): AdvanceReturnState {
  if (input.returnSatang <= 0 || input.method === null) return 'none'
  if (input.outstandingSatang <= 0) return 'closed'
  return input.method === 'payout_offset' ? 'pending_offset' : 'pending_separate'
}

export const ADVANCE_RETURN_METHOD_LABEL: Readonly<Record<AdvanceReturnMethod, string>> = {
  payout_offset: 'หักกลบในรอบจ่ายถัดไป',
  separate: 'รับคืนแยก (เงินสด/โอน)',
}

export const ADVANCE_RETURN_CHANNEL_LABEL: Readonly<Record<AdvanceReturnChannel, string>> = {
  payout_offset: 'หักกลบในรอบจ่าย',
  cash: 'เงินสด',
  bank_transfer: 'โอนเข้าบัญชีบริษัท',
}

/**
 * ป้ายบรรทัดหักบนไฟล์โอน/ใบสำคัญจ่าย/สลิป — `advanceNumber` = เลขที่ใบเบิกเงินทดรองที่ระบบออกให้
 * (`advances.advance_number` — มติ PO U102 · เดิม derive จาก id)
 */
export function advanceOffsetLineLabel(advanceNumber: string): string {
  return `หักคืนเงินทดรอง ${advanceNumber}`
}

// ── มติ PO 05/10/2569 (UAT U74) — ห้ามเคลียร์ยอดขณะเงินทดรองอยู่ในรอบจ่ายที่ยังไม่โอนจริง ─────────

/**
 * สถานะรอบจ่ายที่ "เงินยังไม่ออกจริง" — เงินทดรองที่ถูกดึงเข้ารอบสถานะเหล่านี้ยังเคลียร์ยอดไม่ได้
 * (`completed` = โอนแล้ว เคลียร์ได้ · `cancelled` = รอบถูกยกเลิก เงินทดรองถูกปล่อยออกจากรอบแล้ว — U67)
 */
export const PENDING_PAYOUT_BATCH_STATUSES: readonly PayoutBatchStatus[] = ['draft', 'checking', 'file_generated']

/** รอบจ่ายที่เงินทดรองถูกดึงเข้า (ผ่าน `advances.payout_batch_item_id`) — `null` = ยังไม่อยู่ในรอบใด */
export interface AdvancePayoutBatchRef {
  id: string
  name: string
  status: PayoutBatchStatus
}

/** รอบจ่ายที่ยังไม่โอนซึ่งบล็อกการเคลียร์ยอด — `null` = ไม่บล็อก */
export function pendingPayoutBlockingSettle(batch: AdvancePayoutBatchRef | null): AdvancePayoutBatchRef | null {
  if (batch === null) return null
  return PENDING_PAYOUT_BATCH_STATUSES.includes(batch.status) ? batch : null
}

/** ข้อความที่ผู้ใช้เห็น — บอกชื่อรอบจ่ายที่ต้องรอ (ใช้ร่วม error ฝั่ง API และเหตุผลปุ่มที่ปิดไว้) */
export function pendingPayoutSettleMessage(batchName: string): string {
  return `เงินทดรองนี้อยู่ในรอบจ่าย "${batchName}" ที่ยังไม่ยืนยันโอนเงิน — เคลียร์ยอดได้หลังรอบจ่ายนี้โอนเงินสำเร็จ`
}

/**
 * มติ PO U83 — เงินทดรองถือว่า "จ่ายแล้ว" เมื่อเคยอยู่ในรอบจ่ายที่ `completed` (โอนจริงแล้ว) อย่างน้อยหนึ่งรอบ
 * · รอบที่ยกเลิก (U67) / ยังไม่โอน ไม่นับ · ไม่เคยถูกดึงเข้ารอบใดเลย = ยังไม่จ่าย
 */
export function isAdvancePaidOut(batches: readonly Pick<AdvancePayoutBatchRef, 'status'>[]): boolean {
  return batches.some((batch) => batch.status === 'completed')
}

/** ข้อความที่ผู้ใช้เห็นเมื่อเงินทดรองยังไม่เคยจ่ายจริง (มติ PO U83) — ใช้ร่วม error ฝั่ง API และเหตุผลปุ่มที่ปิดไว้ */
export const ADVANCE_NOT_PAID_SETTLE_MESSAGE = 'ยังไม่ได้จ่ายเงินทดรองนี้ — เคลียร์ได้หลังจ่ายแล้ว'

/**
 * เหตุผลที่ยังเคลียร์ยอดไม่ได้เพราะเงินยังไม่ออกจริง (`null` = เคลียร์ได้)
 * ① อยู่ในรอบจ่ายที่ยังไม่ยืนยันโอน (U74) ⇒ บอกชื่อรอบ ② ยังไม่เคยอยู่ในรอบจ่ายที่ `completed` (U83)
 */
export function settlePayoutBlockMessage(batch: AdvancePayoutBatchRef | null, paidOut: boolean): string | null {
  const blocking = pendingPayoutBlockingSettle(batch)
  if (blocking !== null) return pendingPayoutSettleMessage(blocking.name)
  return paidOut ? null : ADVANCE_NOT_PAID_SETTLE_MESSAGE
}

/**
 * ยามฝั่ง service — เงินยังไม่ออกจริง ⇒ `ADVANCE_IN_PENDING_PAYOUT`
 * (U74: อยู่ในรอบจ่ายที่ยังไม่ `completed` · U83: ยังไม่เคยอยู่ในรอบจ่ายที่ `completed` — ใช้ code เดียวกัน
 * เพราะความหมายเดียวกันคือ "รอจ่าย" ต่างกันที่ข้อความ)
 */
export function assertSettleNotInPendingPayout(
  advanceId: string,
  batch: AdvancePayoutBatchRef | null,
  paidOut: boolean,
): void {
  const blocking = pendingPayoutBlockingSettle(batch)
  if (blocking !== null) {
    throw new AdvanceError('ADVANCE_IN_PENDING_PAYOUT', {
      message: pendingPayoutSettleMessage(blocking.name),
      context: { payoutBatchId: blocking.id, payoutBatchName: blocking.name, payoutBatchStatus: blocking.status },
      detail: `advance=${advanceId} อยู่ในรอบจ่าย ${blocking.id} (${blocking.status})`,
    })
  }
  if (paidOut) return
  throw new AdvanceError('ADVANCE_IN_PENDING_PAYOUT', {
    message: ADVANCE_NOT_PAID_SETTLE_MESSAGE,
    context: { payoutBatchId: null, payoutBatchName: null, payoutBatchStatus: null },
    detail: `advance=${advanceId} ยังไม่เคยอยู่ในรอบจ่ายที่ completed`,
  })
}
