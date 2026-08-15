import { AdvanceError } from '@/lib/advances/errors'
import { toInputDate } from '@/lib/format/datetime'
import type { AdvanceStatus } from '@/lib/generated/prisma/enums'

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
