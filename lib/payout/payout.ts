import type { ApiWarning } from '@/lib/api/envelope'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import type { PayoutBatchSide, PayoutBatchStatus, RoleGroup, TeamSide } from '@/lib/generated/prisma/enums'
import { PayoutError } from '@/lib/payout/errors'

/**
 * รอบจ่ายเงิน (ไฟล์ 17) — **pure ล้วน ใช้ร่วม FE/BE ไม่มี I/O**
 *
 * ### กติกาที่ไฟล์นี้เป็นเจ้าของ
 * - **state machine `23` §6.6**: `draft → checking → file_generated → completed`
 *   · `draft` เป็น transient state (`17` §7.1/§9) — ระบบเปลี่ยนเป็น `checking` เองทันทีที่ดึงรายการครบ
 *     ไม่มีปุ่มให้ผู้ใช้กด
 *   · **สร้างไฟล์โอนซ้ำได้** (`file_generated → file_generated`) แต่ต้องเตือน `DUPLICATE_PAYMENT_FILE`
 *     พร้อมวันที่ของครั้งก่อนเสมอ (`17` §6.3/§11 — เตือน ไม่ reject)
 * - **1 รอบ = 1 ฝั่งเสมอ** (`17` §6.1) — `MIXED_SIDE_BATCH` เป็นยามสุดท้ายก่อนเขียนลง DB
 * - **payee ที่ยังไม่ยืนยัน ห้ามเข้ารอบจ่ายเด็ดขาด** (`17` §10 · `18` §10) — reject ทั้งรอบ
 *   ไม่ใช่คัดรายการนั้นทิ้งเงียบ ๆ (การเงินต้องรู้ว่ามีใครตกค้าง)
 *
 * ⚠️ ยอดเงินทุกตัวคิดที่ `lib/finance/*` (3.1) เท่านั้น — `summarizePayoutBatch()` (`22` §6.10)
 *    และ `calculateWhtForPayee()` (`22` §6.9) ห้ามคิดสูตรซ้ำที่นี่
 */

export const MANAGE_PAYOUT_BATCH = 'manage_payout_batch'
export const GENERATE_PAYMENT_FILE = 'generate_payment_file'

/** action ของ state machine (`23` §6.6) — ชื่อตรงกับ endpoint ที่เรียกใช้ */
export type PayoutBatchAction = 'collect' | 'generate_file' | 'complete'

const TRANSITIONS: Readonly<Record<PayoutBatchAction, Readonly<Record<string, PayoutBatchStatus>>>> = {
  // ระบบดึงรายการครบแล้วเปลี่ยนเองทันที (`17` §9 v2.1)
  collect: { draft: 'checking' },
  // สร้างไฟล์ซ้ำได้ — ตัวเตือนอยู่ที่ `duplicatePaymentFileWarning()` ไม่ใช่การบล็อกที่นี่
  generate_file: { checking: 'file_generated', file_generated: 'file_generated' },
  // sync จากไฟล์ 35 (Phase 4.2) เป็นหลัก · manual confirm เป็นทางเลือกสำรอง (`17` §9/§18)
  complete: { file_generated: 'completed' },
}

export function nextPayoutBatchStatus(current: PayoutBatchStatus, action: PayoutBatchAction): PayoutBatchStatus {
  const next = TRANSITIONS[action][current]
  if (next === undefined) {
    throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', {
      detail: `${current} --${action}--> ?`,
      context: { currentStatus: current, action },
    })
  }
  return next
}

/**
 * ทำ action นี้จากสถานะปัจจุบันได้หรือไม่ — **ตารางเดียวกับ `nextPayoutBatchStatus()`**
 * ⇒ หน้าจอถามที่นี่แทนการ `if (status === …)` เอง (Rule 05 · แนวเดียวกับ `canAdvanceAction()`)
 */
export function canPayoutAction(current: PayoutBatchStatus, action: PayoutBatchAction): boolean {
  return TRANSITIONS[action][current] !== undefined
}

/** แก้รายการใน batch ที่สร้างไฟล์โอนแล้วไม่ได้ (`17` §10) — ยามของ endpoint ที่จะแตะรายการ */
export function assertBatchItemsEditable(current: PayoutBatchStatus): void {
  if (current === 'draft' || current === 'checking') return
  throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', {
    detail: `items locked at ${current}`,
    context: { currentStatus: current },
  })
}

/**
 * ฝั่งของรายการ (`17` §6.1) — ทีมเป็นตัวชี้ขาด · ไม่มีทีม (พนักงานสำนักงาน/ผู้รับเงินอิสระ) ตกไปใช้
 * กลุ่มของ role · กลุ่ม `system`/`finance_company` ไม่มีฝั่งของตัวเอง ⇒ `null` = จัดรอบจ่ายให้ไม่ได้
 */
export function resolvePayoutSide(input: {
  teamSide: TeamSide | null
  roleGroup: RoleGroup
}): PayoutBatchSide | null {
  if (input.teamSide !== null) return input.teamSide
  if (input.roleGroup === 'inhouse' || input.roleGroup === 'outsource') return input.roleGroup
  return null
}

export interface PayoutCandidateGuard {
  payeeId: string
  payeeName: string
  isVerified: boolean
  side: PayoutBatchSide | null
}

/** `17` §10/§11 · `18` §10 — มีใครยังไม่ยืนยันแม้รายเดียว = reject ทั้งรอบ พร้อมบอกว่าใคร */
export function assertPayeesVerified(candidates: readonly PayoutCandidateGuard[]): void {
  const unverified = candidates.filter((candidate) => !candidate.isVerified)
  if (unverified.length === 0) return

  const names = [...new Set(unverified.map((candidate) => candidate.payeeName))]
  throw new PayoutError('UNVERIFIED_PAYEE_IN_PAYOUT', {
    detail: `payees=${[...new Set(unverified.map((candidate) => candidate.payeeId))].join(',')}`,
    context: { payees: names },
  })
}

/** `17` §6.1/§11 — ยามสุดท้ายก่อนเขียน: ทุกรายการต้องเป็นฝั่งเดียวกับรอบจ่าย */
export function assertSingleSide(
  side: PayoutBatchSide,
  candidates: readonly PayoutCandidateGuard[],
): void {
  const others = candidates.filter((candidate) => candidate.side !== side)
  if (others.length === 0) return
  throw new PayoutError('MIXED_SIDE_BATCH', {
    detail: `batch=${side} offending=${others.length}`,
    context: { side, mismatchedCount: others.length },
  })
}

/** `17` §11 — ไม่มีรายการให้จ่าย = ไม่สร้างรอบเปล่าทิ้งไว้ให้สับสน */
export function assertHasItemsToPay(count: number): void {
  if (count > 0) return
  throw new PayoutError('NO_ITEMS_TO_PAY')
}

export const PAYOUT_SIDE_LABEL: Readonly<Record<PayoutBatchSide, string>> = {
  inhouse: 'Inhouse',
  outsource: 'Outsource',
}

export const PAYOUT_STATUS_LABEL: Readonly<Record<PayoutBatchStatus, string>> = {
  draft: 'กำลังรวบรวมรายการ',
  checking: 'กำลังตรวจสอบ',
  file_generated: 'สร้างไฟล์โอนแล้ว',
  completed: 'จ่ายสำเร็จ',
}

/**
 * ชื่อรอบจ่ายเริ่มต้น (`17` §7.1 ตัวอย่าง "รอบจ่าย Outsource ประจำวันที่ …")
 *
 * ⚠️ `02` §8 **ไม่มีคอลัมน์ `cutoff_date`** ในตาราง `payout_batches` (ต่างจาก `17` §7.1) — ตาม
 * ลำดับเอกสาร `02` ชนะ ⇒ วันตัดรอบถูกเก็บไว้ 2 ที่: ในชื่อรอบ (อ่านออกบนหน้าจอ) และใน audit log
 */
export function buildPayoutBatchName(side: PayoutBatchSide, cutoffDate: Date): string {
  return `รอบจ่าย ${PAYOUT_SIDE_LABEL[side]} ตัดรอบ ${fmtDate(cutoffDate)}`
}

/**
 * `17` §6.3 — key กันโอนซ้ำ **1 รอบ = 1 key** (คอลัมน์ `idempotency_key` UNIQUE ระดับ DB)
 * สร้างครั้งเดียวตอนสร้างไฟล์โอนครั้งแรก แล้ว**ใช้ค่าเดิมตลอด** — สร้างไฟล์ซ้ำต้องได้ key เดิม
 * เพื่อให้ระบบธนาคารตรวจจับไฟล์ซ้ำได้เอง
 *
 * @param uniqueSuffix ค่าที่ผู้เรียกสุ่มมา (เช่น `randomUUID()`) — รับเข้ามาเพื่อให้ฟังก์ชันนี้ pure/ทดสอบได้
 */
export function buildIdempotencyKey(input: {
  side: PayoutBatchSide
  generatedAt: Date
  uniqueSuffix: string
}): string {
  const stamp = fmtDate(input.generatedAt).split('/').reverse().join('') // YYYY(พ.ศ.)MMDD
  const suffix = input.uniqueSuffix.replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()
  return `PB-${input.side === 'inhouse' ? 'IN' : 'OUT'}-${stamp}-${suffix}`
}

/**
 * `17` §6.3/§11 `DUPLICATE_PAYMENT_FILE` — **เตือน ไม่ block** (Rule 04 กลุ่ม 4 code ที่เตือนอย่างเดียว)
 * ข้อความต้องมีวันที่ของครั้งก่อนเสมอ เพื่อให้การเงินตัดสินใจได้ว่าไฟล์เดิมถูกอัปโหลดไปแล้วหรือยัง
 */
export function duplicatePaymentFileWarning(previousGeneratedAt: Date): ApiWarning {
  return {
    code: 'DUPLICATE_PAYMENT_FILE',
    title: 'รอบจ่ายนี้เคยสร้างไฟล์โอนแล้ว',
    message: `Batch นี้สร้างไฟล์โอนไปแล้วเมื่อ ${fmtDateTime(previousGeneratedAt)} — ไฟล์ใหม่ใช้ Idempotency Key เดิม ตรวจสอบให้แน่ใจว่ายังไม่ได้อัปโหลดไฟล์เดิมเข้าระบบธนาคาร`,
  }
}

/**
 * `18` §6.3 · `22` §6.9 · Rule 01 — **เตือน ไม่ block** (`WHT_RATE_FALLBACK_TO_PLAN`)
 *
 * Payee-level ชนะ Plan-level เสมอ · ผู้รับเงินที่ยังไม่ผูก Tax Profile จะถูกคิดด้วยอัตราของ
 * Compensation Plan เป็นค่าสำรอง — **กติกาบังคับว่าต้องเตือนทุกครั้ง** ไม่ใช่คิดเงียบ ๆ
 * (เลือกเตือนแทนบล็อกเพราะ `18` §9 ไม่ได้บังคับให้ Payee ที่ verified ต้องมี Tax Profile —
 * บล็อกจะทำให้ทั้งรอบจ่ายไม่ได้เพราะข้อมูลที่แก้ทีหลังได้ · มติ PO ตอนรีวิว Phase 3)
 *
 * คืน `null` เมื่อไม่มีใคร fallback — ผู้เรียกส่งต่อเป็น `warning` ของ envelope ได้ตรง ๆ
 */
export function whtFallbackWarning(payeeNames: readonly string[]): ApiWarning | null {
  const names = [...new Set(payeeNames)].filter((name) => name.trim() !== '')
  if (names.length === 0) return null

  // รายชื่อยาวเกินไปอ่านไม่ไหว — ตัดที่ 3 คนแล้วบอกจำนวนที่เหลือ (ยอดรวมยังบอกครบ)
  const shown = names.slice(0, 3).join(', ')
  const rest = names.length - Math.min(names.length, 3)
  const who = rest === 0 ? shown : `${shown} และอีก ${rest} คน`
  return {
    code: 'WHT_RATE_FALLBACK_TO_PLAN',
    title: 'มีผู้รับเงินที่ยังไม่ผูกกติกาภาษี',
    message: `${who} ยังไม่มี Tax Profile — รอบนี้ใช้อัตรา WHT จากแผนค่าตอบแทนเป็นค่าสำรอง (${names.length} คน) โปรดผูก Tax Profile ให้เรียบร้อยก่อนรอบถัดไป`,
  }
}

/** ชื่อไฟล์โอนที่ดาวน์โหลด — เดินเวอร์ชันทุกครั้งที่สร้างซ้ำ (ห้าม overwrite ของเดิม — Rule 04 idempotency) */
export function paymentFileName(input: {
  idempotencyKey: string
  version: number
  extension: 'csv' | 'txt'
}): string {
  return `${input.idempotencyKey}-v${input.version}.${input.extension}`
}

/**
 * เวอร์ชันถัดไปของไฟล์โอน — อ่านจาก path ของไฟล์ล่าสุด (`payment_file_url`) เพราะ `02` §8 ไม่มี
 * คอลัมน์นับจำนวนครั้ง · ไม่เคยสร้าง/อ่านไม่ออก = เริ่มที่ 1
 *
 * ⚠️ `paymentFileStoragePath()` **ไม่มี**เวลาต่อท้าย — path ผูกกับ `(batchId, idempotencyKey, version)`
 * ล้วน ⇒ สองคำขอที่สร้างไฟล์พร้อมกันบนรอบเดียวกันจะได้ path เดียวกัน แล้วคนที่สองถูก `upsert: false`
 * ปฏิเสธ (ไม่ทับของเดิม = ผลลัพธ์ที่ต้องการ) · คีย์ที่ใช้ประกอบ path ถูกจองแบบ atomic ที่
 * `claimIdempotencyKey()` แล้ว ⇒ ทั้งสองฝั่งอ้างคีย์เดียวกันเสมอ ธนาคารจับซ้ำได้
 */
export function nextPaymentFileVersion(previousFileUrl: string | null): number {
  if (previousFileUrl === null) return 1
  const matched = /-v(\d+)\.(?:csv|txt)$/.exec(previousFileUrl)
  return matched === null ? 1 : Number(matched[1]) + 1
}

/** path บน object storage — versioned เช่นกัน (`payment-files` bucket, private) */
export function paymentFileStoragePath(input: {
  batchId: string
  idempotencyKey: string
  version: number
  extension: 'csv' | 'txt'
}): string {
  return `payout-batches/${input.batchId}/${paymentFileName(input)}`
}
