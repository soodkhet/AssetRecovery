import type { BankMatchStatus } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * เครื่องจับคู่รายการเดินบัญชี (ไฟล์ 35 §6.2–6.4 · state machine `23` §6.14) — **pure ล้วน**
 *
 * ### กติกาที่ห้ามหลุด
 * - **auto-match ต่อเมื่อเหลือผู้สมัครเพียงรายเดียว** (`35` §6.2) — ยอดตรงเป๊ะ + อยู่ในช่วง
 *   `auto_match_tolerance_days` ของบัญชีนั้น (`13` §6.3) · ผู้สมัคร ≥ 2 = ปล่อยเป็น `unmatched`
 *   ให้คนตัดสิน **ห้ามเดาว่าอันไหนใช่**
 * - เงินเข้า ↔ รอบวางบิลที่ `sent` · เงินออก ↔ รอบจ่ายที่ `file_generated` เท่านั้น
 * - **A1** (มติ PO 2026-08-12): ลูกค้าหัก WHT ก่อนโอน ⇒ ยอดที่เข้าจริงอาจเป็น `total − wht`
 *   จึงเทียบทั้งสองค่า
 * - ยอดจับคู่ manual ที่ **ไม่ตรงเป๊ะ** ต้องมี `match_note` เสมอ (`MATCH_NOTE_REQUIRED`)
 *   และ `unmatched_resolved` ต้องมี note เสมอไม่ว่ากรณีใด (`35` §10)
 */

/** ฝั่งของรายการ — คิดจากเครื่องหมายของ `amount_satang` (บวก = รับเงิน) */
export type BankTransactionSide = 'in' | 'out'

/** ชนิดของรายการปลายทางที่จับคู่ได้ (Separate FK — DEC-004) */
export type MatchTargetKind = 'billing' | 'payout'

export function transactionSide(amountSatang: number): BankTransactionSide {
  return amountSatang >= 0 ? 'in' : 'out'
}

/** ผู้สมัครจับคู่ 1 ราย — ฝั่งเรียกเตรียมมาจาก DB แล้ว (ที่นี่ไม่แตะ Prisma) */
export interface MatchCandidate {
  kind: MatchTargetKind
  id: string
  /** เลขที่/ชื่อที่คนอ่านรู้เรื่อง — ใช้ในข้อความ audit และ dropdown */
  ref: string
  /** ยอดเต็มของเอกสาร (บวกเสมอ) */
  amountSatang: number
  /**
   * ยอดทางเลือกที่ยอมรับได้ว่า "ตรง" — A1: รอบวางบิลที่ลูกค้าหัก WHT ก่อนโอน (`total − wht`)
   * `null` = ไม่มีทางเลือกอื่น
   */
  altAmountSatang: number | null
  /** วันอ้างอิงของเอกสาร (วันวางบิล / วันสร้างไฟล์โอน) — `null` = ไม่รู้วัน ⇒ ไม่เข้าเกณฑ์ auto */
  referenceDate: Date | null
}

export type AutoMatchOutcome =
  | { matched: true; candidate: MatchCandidate; matchedAmountSatang: number }
  | { matched: false; reason: 'no_candidate' | 'ambiguous'; candidateCount: number }

const DAY_MS = 86_400_000

/** จำนวนวันที่รายการเดินบัญชีเกิดหลังวันอ้างอิงของเอกสาร (ลบ = เกิดก่อนเอกสาร) */
export function daysAfter(referenceDate: Date, transactionDate: Date): number {
  return Math.round((transactionDate.getTime() - referenceDate.getTime()) / DAY_MS)
}

/**
 * ผู้สมัครรายนี้เข้าเกณฑ์ auto-match ไหม — ยอดตรงเป๊ะ (เต็มหรือ `total − wht`)
 * และเงินต้องเกิด**ตั้งแต่วันเอกสารเป็นต้นไป** ไม่เกิน tolerance (`35` §6.2 "เงินเข้าที่ช้ากว่า
 * วันวางบิลไม่เกินจำนวนวันนี้")
 */
export function candidateMatches(
  candidate: MatchCandidate,
  input: { amountSatang: number; transactionDate: Date; toleranceDays: number },
): { matched: boolean; matchedAmountSatang: number } {
  const absolute = Math.abs(input.amountSatang)
  const acceptable = [candidate.amountSatang, candidate.altAmountSatang].filter(
    (value): value is number => value !== null && value > 0,
  )
  const matchedAmount = acceptable.find((value) => value === absolute)
  if (matchedAmount === undefined) return { matched: false, matchedAmountSatang: 0 }
  if (candidate.referenceDate === null) return { matched: false, matchedAmountSatang: 0 }

  const gap = daysAfter(candidate.referenceDate, input.transactionDate)
  if (gap < 0 || gap > input.toleranceDays) return { matched: false, matchedAmountSatang: 0 }
  return { matched: true, matchedAmountSatang: matchedAmount }
}

/**
 * หา match อัตโนมัติของรายการเดียว — **เจอ 1 รายเท่านั้นถึงจับคู่** (`35` §6.2)
 *
 * ผู้เรียกกรองฝั่ง (in/out) มาแล้วหรือไม่ก็ได้ — ที่นี่กรองซ้ำให้เสมอเพื่อกันเงินออกไปจับกับบิล
 */
export function findAutoMatch(
  input: { amountSatang: number; transactionDate: Date; toleranceDays: number },
  candidates: readonly MatchCandidate[],
): AutoMatchOutcome {
  const side = transactionSide(input.amountSatang)
  const wantKind: MatchTargetKind = side === 'in' ? 'billing' : 'payout'

  const hits = candidates
    .filter((candidate) => candidate.kind === wantKind)
    .map((candidate) => ({ candidate, result: candidateMatches(candidate, input) }))
    .filter((entry) => entry.result.matched)

  if (hits.length === 0) return { matched: false, reason: 'no_candidate', candidateCount: 0 }
  if (hits.length > 1) return { matched: false, reason: 'ambiguous', candidateCount: hits.length }

  const [only] = hits
  if (only === undefined) return { matched: false, reason: 'no_candidate', candidateCount: 0 }
  return { matched: true, candidate: only.candidate, matchedAmountSatang: only.result.matchedAmountSatang }
}

/** ชนิดปลายทางที่ฝั่งของรายการยอมให้จับคู่ได้ — เงินเข้า = บิล · เงินออก = รอบจ่าย */
export function allowedTargetKind(amountSatang: number): MatchTargetKind {
  return transactionSide(amountSatang) === 'in' ? 'billing' : 'payout'
}

/**
 * ยอดจับคู่ตรงเป๊ะไหม — ใช้ตัดสินว่า `match_note` บังคับหรือไม่ (`35` §6.3)
 * A1: บิลที่ลูกค้าหัก WHT ก่อนโอน (`total − wht`) ถือว่า "ตรง" เช่นกัน
 */
export function isExactMatchAmount(
  transactionAmountSatang: number,
  candidate: Pick<MatchCandidate, 'amountSatang' | 'altAmountSatang'>,
): boolean {
  const absolute = Math.abs(transactionAmountSatang)
  return absolute === candidate.amountSatang || (candidate.altAmountSatang !== null && absolute === candidate.altAmountSatang)
}

/**
 * A1 — WHT ที่ลูกค้าหักไว้ก่อนโอน สำหรับบันทึกลงใบเงินรับ (`31` §8 · มติ PO 2026-08-12)
 *
 * ยอดที่เข้าบัญชีจริงเท่ากับ `total − wht` เมื่อใดก็ตามที่ลูกค้าหักภาษีก่อนโอน ⇒ ส่วนต่างคือ
 * **เครดิตภาษีของบริษัท** ต้องเก็บไว้กับใบเงินรับ ไม่ใช่ปล่อยเป็น 0 (ไม่งั้นตามเครดิตรายใบไม่ได้)
 * · คืน 0 เมื่อรับเต็มจำนวนหรือยอดไม่ตรงทั้งสองค่า — **ไม่เดาส่วนต่าง** เพราะยอดที่ไม่ตรงเป๊ะ
 *   เกิดได้จากจ่ายบางส่วน/ค่าธรรมเนียม ซึ่งไม่ใช่ภาษีหัก ณ ที่จ่าย
 * · เลขจำนวนเต็มล้วน ไม่คิดอัตราภาษีใหม่ (อัตราถูก snapshot ไว้ที่ `billing_batches` แล้ว)
 */
export function whtWithheldForReceipt(
  transactionAmountSatang: number,
  candidate: Pick<MatchCandidate, 'amountSatang' | 'altAmountSatang'>,
): number {
  const absolute = Math.abs(transactionAmountSatang)
  if (candidate.altAmountSatang === null || absolute !== candidate.altAmountSatang) return 0
  return candidate.amountSatang - absolute
}

/** `MATCH_NOTE_REQUIRED` — จับคู่ manual ที่ยอดไม่ตรงเป๊ะต้องมีหมายเหตุ (`35` §11) */
export function manualMatchRequiresNote(input: {
  exactAmount: boolean
  /** จับคู่ทับของเดิม (re-match) — `35` §10 บังคับให้มีเหตุผลเสมอ */
  isRematch: boolean
}): boolean {
  return !input.exactAmount || input.isRematch
}

export function hasNote(note: string | null | undefined): boolean {
  return typeof note === 'string' && note.trim().length > 0
}

// ── State machine `23` §6.14 ────────────────────────────────────────────────

export type BankMatchAction = 'auto_match' | 'manual_match' | 'resolve_unmatched'

const TRANSITIONS: Readonly<Record<BankMatchAction, readonly BankMatchStatus[]>> = {
  // จับคู่ทับของเดิมได้ (matched → unmatched → matched ใหม่ ตาม `23` §6.14 "re-match ต้อง audit")
  auto_match: ['unmatched'],
  manual_match: ['unmatched', 'auto_matched', 'manual_matched'],
  // `unmatched_resolved` เป็น terminal — ปิดรายการที่จับคู่ไปแล้วไม่ได้
  resolve_unmatched: ['unmatched'],
}

export function canTransition(current: BankMatchStatus, action: BankMatchAction): boolean {
  return TRANSITIONS[action].includes(current)
}

export function nextBankMatchStatus(current: BankMatchStatus, action: BankMatchAction): BankMatchStatus | null {
  if (!canTransition(current, action)) return null
  switch (action) {
    case 'auto_match':
      return 'auto_matched'
    case 'manual_match':
      return 'manual_matched'
    case 'resolve_unmatched':
      return 'unmatched_resolved'
  }
}

/** จับคู่ไปแล้วหรือยัง — ใช้เตือน `ALREADY_MATCHED` ก่อนเปลี่ยนการจับคู่เดิม (`35` §11) */
export function isMatched(status: BankMatchStatus): boolean {
  return status === 'auto_matched' || status === 'manual_matched'
}

/** นับเป็น "จัดการครบ" ของ Readiness Check ไหม (`35` §16 · `30`) — resolved ก็ถือว่าครบ */
export function isReconciled(status: BankMatchStatus): boolean {
  return status !== 'unmatched'
}

export const BANK_MATCH_STATUS_LABEL: Readonly<Record<BankMatchStatus, string>> = {
  unmatched: 'ยังไม่จับคู่',
  auto_matched: 'จับคู่อัตโนมัติ',
  manual_matched: 'จับคู่โดยเจ้าหน้าที่',
  unmatched_resolved: 'ปิดรายการแล้ว',
}

/** 4 สีตาม `35` §8 — ผ่าน mapper กลางของ `04` §8.1 เท่านั้น (แดง/เขียว/ฟ้า/เทา) */
export const BANK_MATCH_STATUS_GROUP: Readonly<Record<BankMatchStatus, StatusBadgeGroup>> = {
  unmatched: 'critical',
  auto_matched: 'success',
  manual_matched: 'sent',
  unmatched_resolved: 'neutral',
}

export const MATCH_TARGET_LABEL: Readonly<Record<MatchTargetKind, string>> = {
  billing: 'รอบวางบิล (Billing Batch)',
  payout: 'รอบจ่ายเงิน (Payout Batch)',
}

/** capability ของโมดูลนี้ (`25` §7.5 — บัญชีจัดการ · การเงินดูอย่างเดียว) */
export const MANAGE_BANK_RECONCILIATION = 'manage_bank_reconciliation'
