import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import { resolveCustomerWhtForReceipt } from '@/lib/finance/ar-calc'
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

/** รายการเดินบัญชีที่จับคู่กับเอกสารไปแล้ว (staging E-057) */
export interface MatchedTransactionRef {
  id: string
  transactionDate: Date
  amountSatang: number
}

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
  /**
   * มติ O75 — ยอดค้างที่เหลือของรอบที่รับเงินไปบางส่วนแล้ว (เช่น ส่วนของใบเพิ่มหนี้หลังรับชำระครบ) ถือว่า "ตรง" ด้วย ·
   * แยกจาก `altAmountSatang` เพราะไม่ใช่ยอดหลังลูกค้าหัก ณ ที่จ่าย (ห้ามอนุมาน WHT จากยอดนี้) · ไม่มี = `null`/ไม่ส่ง
   */
  remainingAmountSatang?: number | null
  /**
   * staging E-064 — ยอดค้างที่เหลือ**หลังลูกค้าหัก ณ ที่จ่าย** ส่วนที่ยังไม่บันทึก (`remainingAfterCustomerWhtSatang()`)
   * ถือว่า "ตรง" ด้วย · ใช้วันอ้างอิงเดียวกับยอดค้าง · ไม่มี = `null`/ไม่ส่ง
   */
  remainingAltAmountSatang?: number | null
  /**
   * staging E-057 — รายการเดินบัญชีที่จับคู่กับรอบจ่ายนี้ไปแล้ว (1 รอบจ่ายจับคู่ได้หลายบรรทัด แต่ต้องยืนยัน) · ไม่มี = ไม่ส่ง
   */
  matchedTransactions?: readonly MatchedTransactionRef[]
  /** วันอ้างอิงของเอกสาร (วันวางบิล / วันสร้างไฟล์โอน) — `null` = ไม่รู้วัน ⇒ ไม่เข้าเกณฑ์ auto */
  referenceDate: Date | null
  /**
   * มติ O77 — วันอ้างอิงของ **ยอดค้างที่เหลือ** เมื่อยอดนั้นเกิดจากใบเพิ่มหนี้ (= วันออกใบเพิ่มหนี้ล่าสุด)
   * ⇒ ช่วงวันของการเทียบยอดค้างนับจากวันนี้แทนวันวางบิลเดิม · ไม่มี = ใช้ `referenceDate`
   */
  remainingReferenceDate?: Date | null
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
): { matched: boolean; matchedAmountSatang: number; referenceDate: Date | null } {
  const absolute = Math.abs(input.amountSatang)
  // ยอดที่ยอมรับ + วันอ้างอิงของยอดนั้น — ยอดค้างจากใบเพิ่มหนี้นับช่วงวันจากวันออกใบเพิ่มหนี้ล่าสุด (มติ O77)
  const options: { amount: number | null; referenceDate: Date | null }[] = [
    { amount: candidate.amountSatang, referenceDate: candidate.referenceDate },
    { amount: candidate.altAmountSatang, referenceDate: candidate.referenceDate },
    {
      amount: candidate.remainingAmountSatang ?? null,
      referenceDate: candidate.remainingReferenceDate ?? candidate.referenceDate,
    },
    {
      amount: candidate.remainingAltAmountSatang ?? null,
      referenceDate: candidate.remainingReferenceDate ?? candidate.referenceDate,
    },
  ]
  for (const option of options) {
    if (option.amount === null || option.amount <= 0 || option.amount !== absolute) continue
    if (option.referenceDate === null) continue
    const gap = daysAfter(option.referenceDate, input.transactionDate)
    if (gap < 0 || gap > input.toleranceDays) continue
    return { matched: true, matchedAmountSatang: option.amount, referenceDate: option.referenceDate }
  }
  return { matched: false, matchedAmountSatang: 0, referenceDate: null }
}

/**
 * มติ O77 — วันอ้างอิงของยอดค้างที่เหลือของรอบวางบิล: มีใบเพิ่มหนี้ active ที่ออก**หลัง**วันวางบิล ⇒ วันออกใบเพิ่มหนี้ล่าสุด
 * (ยอดค้างหลังรับชำระครบเกิดจากใบเพิ่มหนี้ — ลูกค้าโอนส่วนเพิ่มหลังได้รับใบนั้น) · ไม่มี/ไม่หลังกว่า ⇒ `null` (ใช้วันวางบิล)
 */
export function debitNoteReferenceDate(sentAt: Date | null, latestDebitNoteDate: Date | null): Date | null {
  if (latestDebitNoteDate === null) return null
  if (sentAt !== null && latestDebitNoteDate.getTime() <= sentAt.getTime()) return null
  return latestDebitNoteDate
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

/** รายการเดินบัญชีที่ยังไม่จับคู่ 1 แถว — เกณฑ์ช่วงวันมาจากบัญชีธนาคารของรายการนั้นเอง */
export interface ProposalTransaction {
  id: string
  amountSatang: number
  transactionDate: Date
  toleranceDays: number
}

export interface MatchProposal {
  candidate: MatchCandidate
  transactionId: string
  matchedAmountSatang: number
  /** วันอ้างอิงที่ใช้เทียบช่วงวันของคู่นี้ (วันวางบิล / วันออกใบเพิ่มหนี้ล่าสุด — มติ O77 / วันสร้างไฟล์โอน) */
  referenceDate: Date
  /**
   * มีทางเลือกมากกว่าหนึ่ง (รายการนี้เข้าได้หลายเอกสาร หรือเอกสารนี้มีหลายรายการที่เข้าเกณฑ์)
   * ⇒ ผู้ใช้ต้องเลือกเอง — ยังกดยืนยันได้ทีละคู่ แต่หน้าจอต้องเตือนให้ตรวจ
   */
  ambiguous: boolean
}

/**
 * **จับคู่ทางกลับแบบเสนอ** (มติ PO 07/10/2569 U137) — เริ่มจากเอกสาร (รอบวางบิลที่รอรับเงิน / รอบจ่าย)
 * แล้วหารายการเดินบัญชีที่ **ยังไม่จับคู่** ที่ยอดตรงเป๊ะและวันอยู่ในช่วงเดียวกับเกณฑ์ auto-match เดิม
 * (`candidateMatches()` — เงินเกิดตั้งแต่วันเอกสารถึง +tolerance ของบัญชีนั้น)
 *
 * **ไม่จับคู่เอง** — คืนเป็น "คู่ที่เสนอ" ให้คนกดยืนยัน (ผ่าน endpoint จับคู่มือเดิม) · ฝั่งเงินต้องตรงชนิดเอกสาร
 * (เงินเข้า ↔ บิล · เงินออก ↔ รอบจ่าย) · เอกสารที่ไม่มีวันอ้างอิงไม่ถูกเสนอ (ไม่เดา)
 */
export function findMatchProposals(
  candidates: readonly MatchCandidate[],
  transactions: readonly ProposalTransaction[],
): MatchProposal[] {
  const hits: Omit<MatchProposal, 'ambiguous'>[] = []
  for (const candidate of candidates) {
    for (const transaction of transactions) {
      if (allowedTargetKind(transaction.amountSatang) !== candidate.kind) continue
      const result = candidateMatches(candidate, {
        amountSatang: transaction.amountSatang,
        transactionDate: transaction.transactionDate,
        toleranceDays: transaction.toleranceDays,
      })
      if (!result.matched || result.referenceDate === null) continue
      hits.push({
        candidate,
        transactionId: transaction.id,
        matchedAmountSatang: result.matchedAmountSatang,
        referenceDate: result.referenceDate,
      })
    }
  }

  const perCandidate = new Map<string, number>()
  const perTransaction = new Map<string, number>()
  for (const hit of hits) {
    const candidateKey = `${hit.candidate.kind}:${hit.candidate.id}`
    perCandidate.set(candidateKey, (perCandidate.get(candidateKey) ?? 0) + 1)
    perTransaction.set(hit.transactionId, (perTransaction.get(hit.transactionId) ?? 0) + 1)
  }
  return hits.map((hit) => ({
    ...hit,
    ambiguous:
      (perCandidate.get(`${hit.candidate.kind}:${hit.candidate.id}`) ?? 0) > 1 ||
      (perTransaction.get(hit.transactionId) ?? 0) > 1,
  }))
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
  candidate: Pick<MatchCandidate, 'amountSatang' | 'altAmountSatang' | 'remainingAmountSatang' | 'remainingAltAmountSatang'>,
): boolean {
  const absolute = Math.abs(transactionAmountSatang)
  const remaining = candidate.remainingAmountSatang ?? null
  const remainingAlt = candidate.remainingAltAmountSatang ?? null
  return (
    absolute === candidate.amountSatang ||
    (candidate.altAmountSatang !== null && absolute === candidate.altAmountSatang) ||
    (remaining !== null && absolute === remaining) ||
    (remainingAlt !== null && absolute === remainingAlt)
  )
}

/**
 * staging E-064 — ยอดที่ใช้เทียบในกล่องเตือน "ยอดไม่ตรงกันเป๊ะ": รอบที่รับเงินบางส่วนแล้วเทียบกับ**ยอดค้าง** ไม่ใช่ยอดเต็มบิล
 */
export function mismatchCompareAmounts(
  candidate: Pick<MatchCandidate, 'amountSatang' | 'altAmountSatang' | 'remainingAmountSatang' | 'remainingAltAmountSatang'>,
): { label: string; amountSatang: number; afterWhtSatang: number | null } {
  const remaining = candidate.remainingAmountSatang ?? null
  if (remaining !== null) {
    return { label: 'ยอดค้าง', amountSatang: remaining, afterWhtSatang: candidate.remainingAltAmountSatang ?? null }
  }
  return { label: 'ยอดเอกสาร', amountSatang: candidate.amountSatang, afterWhtSatang: candidate.altAmountSatang }
}

/**
 * staging E-057 — ข้อความ "จับคู่แล้วกับ…" ของรอบจ่าย (ไม่นับรายการที่กำลังจับคู่อยู่เอง) · ไม่มี = `null`
 */
export function alreadyMatchedWithText(
  matched: readonly MatchedTransactionRef[] | undefined,
  currentTransactionId: string,
): string | null {
  const others = (matched ?? []).filter((entry) => entry.id !== currentTransactionId)
  if (others.length === 0) return null
  return others
    .map((entry) => `รายการเดินบัญชี ${fmtDate(entry.transactionDate)} ${fmtSatangSymbol(Math.abs(entry.amountSatang))}`)
    .join(', ')
}

/** staging E-056 — หมายเหตุอัตโนมัติเมื่อยืนยันคู่ที่ระบบเสนอโดยไม่ได้กรอกเอง (เดิมเว้นว่าง ⇒ แสดง "—") */
export const PROPOSAL_MATCH_NOTE = 'ยืนยันคู่ที่ระบบเสนอ (ยอดตรง)'

/**
 * staging E-056 — ข้อความ toast หลังจับคู่สำเร็จ ใช้ร่วมกัน (จับคู่ Manual + ยืนยันคู่ที่ระบบเสนอ) ให้บอก**ผลที่เกิดจริง**
 */
export function matchSuccessToast(
  effect:
    | { kind: 'billing'; outstandingSatang: number; bankFeeWrittenOffSatang: number }
    | { kind: 'payout' }
    | null
    | undefined,
  ref: string,
): { title: string; description: string } {
  const title = `จับคู่รายการกับ ${ref} สำเร็จ`
  if (effect?.kind === 'billing') {
    return {
      title,
      description:
        effect.bankFeeWrittenOffSatang > 0
          ? `สร้างเงินรับให้แล้ว · ส่วนต่าง ${fmtSatangSymbol(effect.bankFeeWrittenOffSatang)} ไม่เกินเพดาน บันทึกเป็นค่าธรรมเนียมธนาคาร · รอบชำระครบ`
          : effect.outstandingSatang > 0
            ? `สร้างเงินรับให้แล้ว · ยอดคงค้างของรอบ ${fmtSatangSymbol(effect.outstandingSatang)}`
            : 'สร้างเงินรับให้แล้ว · รอบชำระครบ',
    }
  }
  if (effect?.kind === 'payout') return { title, description: 'ยืนยันรอบจ่ายเป็น "จ่ายแล้ว" ให้อัตโนมัติ' }
  return { title, description: 'ผูกกับรายการเดินบัญชีแล้ว' }
}

/**
 * BUG-159 — ข้อความตัวเลือกในการจับคู่ Manual: ยอดที่แสดง**ต้องเป็นยอดที่ใช้เทียบจริง**
 * - ตรงยอดเต็ม ⇒ `BL-… ฿802.50 (ยอดตรง)`
 * - ตรงยอดหลังลูกค้าหัก ณ ที่จ่าย (A1) ⇒ `BL-… ฿780.00 (ยอดตรงหลังลูกค้าหัก ณ ที่จ่าย · ยอดเต็ม ฿802.50)`
 * - ไม่ตรง ⇒ ยอดเต็ม + ยอดคาดรับหลังหัก (ถ้ามี) เป็นข้อความรอง
 * เดิมแสดงยอดเต็มคู่กับป้าย "(ยอดตรง)" แม้ตรงเพราะยอดหลังหัก ⇒ ผู้ใช้เห็น ฿802.50 "ยอดตรง" กับเงินเข้า ฿780.00
 */
export function matchCandidateOptionText(
  transactionAmountSatang: number,
  candidate: Pick<MatchCandidate, 'amountSatang' | 'altAmountSatang' | 'remainingAmountSatang' | 'remainingAltAmountSatang'> & {
    label: string
    /** staging E-057 — รอบจ่ายที่จับคู่ไปแล้ว ⇒ ต่อท้ายป้าย "จับคู่แล้วกับ…" */
    alreadyMatchedWith?: string | null
  },
): string {
  const text = optionAmountText(transactionAmountSatang, candidate)
  const matched = candidate.alreadyMatchedWith ?? null
  return matched === null ? text : `${text} · จับคู่แล้วกับ${matched}`
}

function optionAmountText(
  transactionAmountSatang: number,
  candidate: Pick<MatchCandidate, 'amountSatang' | 'altAmountSatang' | 'remainingAmountSatang' | 'remainingAltAmountSatang'> & {
    label: string
  },
): string {
  const absolute = Math.abs(transactionAmountSatang)
  const full = fmtSatangSymbol(candidate.amountSatang)
  const alt = candidate.altAmountSatang
  const remaining = candidate.remainingAmountSatang ?? null
  const remainingAlt = candidate.remainingAltAmountSatang ?? null
  if (absolute === candidate.amountSatang) return `${candidate.label} · ${full} (ยอดตรง)`
  if (remaining !== null && absolute === remaining) {
    return `${candidate.label} · ${fmtSatangSymbol(remaining)} (ยอดตรงกับยอดค้างที่เหลือ · ยอดเต็ม ${full})`
  }
  if (remaining !== null && remainingAlt !== null && absolute === remainingAlt) {
    return `${candidate.label} · ${fmtSatangSymbol(remainingAlt)} (ยอดตรงกับยอดค้างหลังลูกค้าหัก ณ ที่จ่าย · ค้าง ${fmtSatangSymbol(remaining)} · ยอดเต็ม ${full})`
  }
  // staging E-064 — รอบที่รับเงินบางส่วนแล้ว ⇒ นำด้วยยอดค้าง (ไม่ให้ผู้ใช้คำนวณเองจากยอดเต็มบิล)
  if (remaining !== null) {
    const afterWht = remainingAlt === null ? '' : ` (คาดรับหลังลูกค้าหัก ณ ที่จ่าย ${fmtSatangSymbol(remainingAlt)})`
    return `${candidate.label} · ค้าง ${fmtSatangSymbol(remaining)}${afterWht} · ยอดเต็ม ${full}`
  }
  if (alt !== null && absolute === alt) {
    return `${candidate.label} · ${fmtSatangSymbol(alt)} (ยอดตรงหลังลูกค้าหัก ณ ที่จ่าย · ยอดเต็ม ${full})`
  }
  if (alt !== null && alt !== candidate.amountSatang) {
    return `${candidate.label} · ${full} (คาดรับหลังลูกค้าหัก ณ ที่จ่าย ${fmtSatangSymbol(alt)})`
  }
  return `${candidate.label} · ${full}`
}

/**
 * A1 — WHT ที่ลูกค้าหักไว้ก่อนโอน สำหรับบันทึกลงใบเงินรับ (`31` §8 · มติ PO 2026-08-12)
 *
 * ยอดที่เข้าบัญชีจริงเท่ากับ `total − wht` เมื่อใดก็ตามที่ลูกค้าหักภาษีก่อนโอน ⇒ ส่วนต่างคือ
 * **เครดิตภาษีของบริษัท** ต้องเก็บไว้กับใบเงินรับ ไม่ใช่ปล่อยเป็น 0 (ไม่งั้นตามเครดิตรายใบไม่ได้)
 * · มติ PO U163 — ยอดรับสะสมขาดจาก `total − wht` ไม่เกินเพดานค่าธรรมเนียม (U144) ก็ยังนับภาษีเต็ม
 *   ส่วนต่างที่เหลือไปเป็นค่าธรรมเนียมธนาคาร — สูตรอยู่ที่ `resolveCustomerWhtForReceipt()` ที่เดียว
 * · รับเต็มยอด/ขาดเกินช่วง/ลูกค้าไม่ได้ตั้งให้หัก (`altAmountSatang = null`) ⇒ 0
 * · เลขจำนวนเต็มล้วน ไม่คิดอัตราภาษีใหม่ (อัตราถูก snapshot ไว้ที่ `billing_batches` แล้ว)
 */
export function whtWithheldForReceipt(
  transactionAmountSatang: number,
  candidate: Pick<MatchCandidate, 'amountSatang' | 'altAmountSatang'>,
  context: { priorReceivedSatang: number; priorWhtSatang: number; toleranceSatang: number },
): number {
  if (candidate.altAmountSatang === null) return 0
  return resolveCustomerWhtForReceipt({
    totalSatang: candidate.amountSatang,
    expectedWhtSatang: Math.max(0, candidate.amountSatang - candidate.altAmountSatang),
    priorReceivedSatang: context.priorReceivedSatang,
    priorWhtSatang: context.priorWhtSatang,
    receiptSatang: Math.abs(transactionAmountSatang),
    toleranceSatang: context.toleranceSatang,
  })
}

/** `MATCH_NOTE_REQUIRED` — จับคู่ manual ที่ยอดไม่ตรงเป๊ะต้องมีหมายเหตุ (`35` §11) */
export function manualMatchRequiresNote(input: {
  exactAmount: boolean
  /** จับคู่ทับของเดิม (re-match) — `35` §10 บังคับให้มีเหตุผลเสมอ */
  isRematch: boolean
  /** staging E-057 — รอบจ่ายจับคู่กับรายการเดินบัญชีอื่นไปแล้ว (1:N ได้ แต่ต้องอธิบาย) */
  targetAlreadyMatched?: boolean
}): boolean {
  return !input.exactAmount || input.isRematch || input.targetAlreadyMatched === true
}

export function hasNote(note: string | null | undefined): boolean {
  return typeof note === 'string' && note.trim().length > 0
}

// ── State machine `23` §6.14 ────────────────────────────────────────────────

export type BankMatchAction =
  | 'auto_match'
  | 'manual_match'
  | 'resolve_unmatched'
  /** U41 — ย้ายเงินเข้าไม่ทราบที่มาไปเป็น "เงินรับรอตรวจสอบ" */
  | 'move_to_suspense'
  /** U41 — คืนเงินรับรอตรวจสอบให้ผู้โอน */
  | 'refund_suspense'

const TRANSITIONS: Readonly<Record<BankMatchAction, readonly BankMatchStatus[]>> = {
  // จับคู่ทับของเดิมได้ (matched → unmatched → matched ใหม่ ตาม `23` §6.14 "re-match ต้อง audit")
  // auto-match ไม่แตะ `suspense` — รายการที่คนตัดสินแล้วว่า "ไม่ทราบที่มา" ต้องจับคู่โดยคนเท่านั้น (U41)
  auto_match: ['unmatched'],
  // U41: ทราบที่มาภายหลัง ⇒ จับคู่กับรอบวางบิลตามสายปกติ (เหตุผลบังคับ — `suspenseMatchRequiresNote`)
  manual_match: ['unmatched', 'auto_matched', 'manual_matched', 'suspense'],
  // `unmatched_resolved` เป็น terminal — ปิดรายการที่จับคู่ไปแล้วไม่ได้
  resolve_unmatched: ['unmatched'],
  // เงินเข้าเท่านั้น (ตรวจที่ `canMoveToSuspense`) · `suspense_refunded` เป็น terminal
  move_to_suspense: ['unmatched'],
  refund_suspense: ['suspense'],
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
    case 'move_to_suspense':
      return 'suspense'
    case 'refund_suspense':
      return 'suspense_refunded'
  }
}

/** U41 — "เงินรับรอตรวจสอบ" ใช้ได้กับเงินเข้าเท่านั้น (เงินออกไม่ทราบที่มา = ปิดรายการพร้อมเหตุผลตามเดิม) */
export function canMoveToSuspense(status: BankMatchStatus, amountSatang: number): boolean {
  return canTransition(status, 'move_to_suspense') && transactionSide(amountSatang) === 'in' && amountSatang > 0
}

/** U41 — ทุก transition ออกจาก `suspense` ต้องมีเหตุผล (จับคู่ภายหลังก็ต้องอธิบายว่าทราบที่มาจากอะไร) */
export function suspenseMatchRequiresNote(status: BankMatchStatus): boolean {
  return status === 'suspense'
}

/** สถานะสุดท้ายของรายการเดินบัญชี — ทำอะไรต่อไม่ได้อีก */
export function isTerminalBankStatus(status: BankMatchStatus): boolean {
  return status === 'unmatched_resolved' || status === 'suspense_refunded'
}

/** จับคู่ไปแล้วหรือยัง — ใช้เตือน `ALREADY_MATCHED` ก่อนเปลี่ยนการจับคู่เดิม (`35` §11) */
export function isMatched(status: BankMatchStatus): boolean {
  return status === 'auto_matched' || status === 'manual_matched'
}

/**
 * นับเป็น "จัดการครบ" ของ Readiness Check ไหม (`35` §16 · `30`) — resolved ก็ถือว่าครบ
 * U41: `suspense` = ตัดสินแล้วว่าเป็นเงินรับรอตรวจสอบ (หนี้สิน) ⇒ ไม่บล็อกปิดงวด แต่แสดงเตือนยอดคงค้าง
 */
export function isReconciled(status: BankMatchStatus): boolean {
  return status !== 'unmatched'
}

export const BANK_MATCH_STATUS_LABEL: Readonly<Record<BankMatchStatus, string>> = {
  unmatched: 'ยังไม่จับคู่',
  auto_matched: 'จับคู่อัตโนมัติ',
  manual_matched: 'จับคู่โดยเจ้าหน้าที่',
  unmatched_resolved: 'ปิดรายการแล้ว',
  suspense: 'เงินรับรอตรวจสอบ',
  suspense_refunded: 'คืนเงินผู้โอนแล้ว',
}

/**
 * สีตาม `35` §8 — ผ่าน mapper กลางของ `04` §8.1 เท่านั้น (แดง/เขียว/ฟ้า/เทา)
 * U41: เงินรับรอตรวจสอบ = เหลือง (รอดำเนินการ) · คืนเงินผู้โอนแล้ว = ม่วง (เคลียร์แล้ว)
 */
export const BANK_MATCH_STATUS_GROUP: Readonly<Record<BankMatchStatus, StatusBadgeGroup>> = {
  unmatched: 'critical',
  auto_matched: 'success',
  manual_matched: 'sent',
  unmatched_resolved: 'neutral',
  suspense: 'pending',
  suspense_refunded: 'cleared',
}

export const MATCH_TARGET_LABEL: Readonly<Record<MatchTargetKind, string>> = {
  billing: 'รอบวางบิล (Billing Batch)',
  payout: 'รอบจ่ายเงิน (Payout Batch)',
}

/** capability ของโมดูลนี้ (`25` §7.5 — บัญชีจัดการ · การเงินดูอย่างเดียว) */
export const MANAGE_BANK_RECONCILIATION = 'manage_bank_reconciliation'

/**
 * staging E-067 (มติ PO 10/10/2569) — รายการเงินออก "โอนคืนผู้โอน" ใน statement ผูกกับเงินรับรอตรวจสอบที่คืนแล้ว
 * ผ่านหน้าต่างปิดรายการ (ไม่แก้ schema): ตัวเลือก = เงินรับรอตรวจสอบสถานะ "คืนเงินผู้โอนแล้ว" ยอดเท่ากัน · เงินเข้าไม่มีตัวเลือก
 */
export function suspenseRefundOptions<
  T extends { id: string; amountSatang: number; matchStatus: BankMatchStatus },
>(transaction: { amountSatang: number }, refunded: readonly T[]): T[] {
  if (transactionSide(transaction.amountSatang) !== 'out') return []
  const absolute = Math.abs(transaction.amountSatang)
  return refunded.filter((entry) => entry.matchStatus === 'suspense_refunded' && entry.amountSatang === absolute)
}

/** เหตุผลปิดรายการที่ระบบเติมให้เมื่อเลือกเงินรับรอตรวจสอบที่คืนแล้ว (staging E-067) */
export function suspenseRefundCloseNote(refunded: {
  transactionDate: string
  amountSatang: number
  description: string
  refundDate: string | null
  refundNote: string | null
}): string {
  const parts = [
    `โอนคืนของเงินรับรอตรวจสอบ ${fmtDate(refunded.transactionDate)} ${fmtSatangSymbol(refunded.amountSatang)} (${refunded.description})`,
  ]
  if (refunded.refundDate !== null) parts.push(`คืนเมื่อ ${fmtDate(refunded.refundDate)}`)
  if (refunded.refundNote !== null && refunded.refundNote.trim() !== '') parts.push(`อ้างอิง ${refunded.refundNote.trim()}`)
  return parts.join(' · ')
}
