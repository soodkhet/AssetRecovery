import { fmtSatangSymbol } from '@/lib/format/money'
import type { SubstituteReceiptStatus } from '@/lib/generated/prisma/enums'
import { SubstituteReceiptError } from '@/lib/substitute-receipts/errors'

/**
 * ใบรับรองแทนใบเสร็จรับเงิน (มติ PO 06/10/2569 U103 · `22` §6.17 · `15` §9.4 · `41` §6.6) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * - ยอดรวมของใบ = ผลรวมยอดของทุกบรรทัด (satang จำนวนเต็ม — Rule 01) · บรรทัดต้องมากกว่า 0
 * - **เพดาน 2 ชั้น** (ค่าตั้งนโยบายการเงิน · ค่าเริ่มต้น ฿500 ต่อใบ / ฿3,000 ต่อคนต่อเดือน):
 *   1. ยอดรวมของใบ ≤ เพดานต่อใบ
 *   2. ยอดของใบที่ออกแล้วของผู้จ่ายคนเดียวกันในเดือนเดียวกัน (เดือนของวันที่ออกใบ เวลาไทย) + ใบนี้ ≤ เพดานต่อเดือน
 *   เกินข้อใดข้อหนึ่ง = บล็อก `SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT` (ไม่ใช่คำเตือน)
 * - **ฐาน WHT ไม่เปลี่ยน**: รายการเบิกที่ใช้ใบรับรองแทนใบเสร็จคงชนิดรายการเดิม (`hotel`/`receipt`) ⇒ ตัวจำแนกฐาน WHT
 *   ตามค่าตั้ง U3 จัดเหมือนรายการที่มีใบเสร็จทุกประการ · ใบที่ผูกเงินทดรองไม่เข้ารอบจ่ายจึงไม่เกี่ยวกับ WHT
 */

/** ค่าเริ่มต้นของเพดาน — ต้องตรงกับ `@default` ใน `schema.prisma` */
export const DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_DOC_SATANG = 50_000
export const DEFAULT_SUBSTITUTE_RECEIPT_MAX_PER_MONTH_SATANG = 300_000

/** จำนวนบรรทัดต่อใบ — หน้าเดียวพอดีกระดาษ A4 */
export const SUBSTITUTE_RECEIPT_MAX_LINES = 15

export interface SubstituteReceiptLineAmount {
  amountSatang: number
}

/** ยอดรวมของใบ — ทุกบรรทัดต้องเป็นจำนวนเต็มสตางค์ที่มากกว่า 0 */
export function substituteReceiptTotalSatang(lines: readonly SubstituteReceiptLineAmount[]): number {
  if (lines.length === 0) throw new RangeError('ใบรับรองแทนใบเสร็จต้องมีอย่างน้อย 1 รายการ')
  return lines.reduce((sum, line) => {
    if (!Number.isInteger(line.amountSatang) || line.amountSatang <= 0) {
      throw new RangeError(`ยอดรายการต้องเป็นจำนวนเต็มสตางค์ที่มากกว่า 0 — ได้รับ ${String(line.amountSatang)}`)
    }
    return sum + line.amountSatang
  }, 0)
}

export interface SubstituteReceiptLimits {
  maxPerDocSatang: number
  maxPerMonthSatang: number
}

export interface SubstituteReceiptLimitCheck extends SubstituteReceiptLimits {
  /** ยอดรวมของใบที่จะออก */
  totalSatang: number
  /** ยอดใบที่ออกแล้วของผู้จ่ายคนเดียวกันในเดือนเดียวกัน (ไม่รวมใบนี้) */
  monthUsedSatang: number
}

export type SubstituteReceiptLimitProblem =
  | { kind: 'per_doc'; limitSatang: number; totalSatang: number }
  | { kind: 'per_month'; limitSatang: number; totalSatang: number; monthUsedSatang: number; remainingSatang: number }

/** ตรวจเพดาน — `null` = ผ่าน · ต่อใบก่อน แล้วจึงต่อเดือน */
export function substituteReceiptLimitProblem(input: SubstituteReceiptLimitCheck): SubstituteReceiptLimitProblem | null {
  if (input.totalSatang > input.maxPerDocSatang) {
    return { kind: 'per_doc', limitSatang: input.maxPerDocSatang, totalSatang: input.totalSatang }
  }
  if (input.monthUsedSatang + input.totalSatang > input.maxPerMonthSatang) {
    return {
      kind: 'per_month',
      limitSatang: input.maxPerMonthSatang,
      totalSatang: input.totalSatang,
      monthUsedSatang: input.monthUsedSatang,
      // ใช้เกินไปแล้ว (เปลี่ยนเพดานลดลงภายหลัง) ⇒ เหลือ 0 ไม่ติดลบ
      remainingSatang: Math.max(0, input.maxPerMonthSatang - input.monthUsedSatang),
    }
  }
  return null
}

/** ข้อความที่ผู้ใช้เห็นเมื่อเกินเพดาน — ใช้ทั้งฟอร์ม (เตือนล่วงหน้า) และ error ฝั่ง server */
export function substituteReceiptLimitMessage(problem: SubstituteReceiptLimitProblem): string {
  if (problem.kind === 'per_doc') {
    return `ยอดรวม ${fmtSatangSymbol(problem.totalSatang)} เกินเพดานต่อใบ ${fmtSatangSymbol(problem.limitSatang)} — รายจ่ายส่วนที่เกินต้องใช้ใบเสร็จจริง`
  }
  return `เดือนนี้ใช้ใบรับรองแทนใบเสร็จไปแล้ว ${fmtSatangSymbol(problem.monthUsedSatang)} จากเพดาน ${fmtSatangSymbol(problem.limitSatang)} ต่อเดือน — ออกได้อีกไม่เกิน ${fmtSatangSymbol(problem.remainingSatang)}`
}

export function assertWithinSubstituteReceiptLimits(input: SubstituteReceiptLimitCheck): void {
  const problem = substituteReceiptLimitProblem(input)
  if (problem === null) return
  throw new SubstituteReceiptError('SUBSTITUTE_RECEIPT_EXCEEDS_LIMIT', {
    message: substituteReceiptLimitMessage(problem),
    context: { limit: problem.kind, limitSatang: problem.limitSatang, totalSatang: problem.totalSatang },
  })
}

/** ฟอร์มเตือนล่วงหน้าเรื่องเพดานต่อใบ (ฝั่ง client ไม่รู้ยอดของเดือน — server ตรวจครบอีกชั้น) */
export function substituteReceiptPerDocWarning(totalSatang: number, maxPerDocSatang: number): string | null {
  const problem = substituteReceiptLimitProblem({
    totalSatang,
    monthUsedSatang: 0,
    maxPerDocSatang,
    maxPerMonthSatang: Number.MAX_SAFE_INTEGER,
  })
  return problem === null ? null : substituteReceiptLimitMessage(problem)
}

/**
 * ช่วงเดือนไทยของวันที่ออกใบ → `[start, end)` เป็นเที่ยงคืน UTC ของคอลัมน์ `DATE`
 * (`issue_date` เก็บวันไทยเป็น DATE แล้ว ⇒ เทียบตรง ๆ ได้)
 */
export function substituteReceiptMonthRange(issueDate: Date): { start: Date; end: Date } {
  if (Number.isNaN(issueDate.getTime())) throw new RangeError('วันที่ออกใบไม่ถูกต้อง')
  // `issueDate` เป็นเที่ยงคืน UTC ของวันไทยอยู่แล้ว (คอลัมน์ DATE) ⇒ ใช้ปี/เดือน UTC ตรง ๆ
  const year = issueDate.getUTCFullYear()
  const month = issueDate.getUTCMonth()
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) }
}

// ── ป้าย/การแสดงผล ────────────────────────────────────────────────────────────

export const SUBSTITUTE_RECEIPT_STATUS_LABEL: Readonly<Record<SubstituteReceiptStatus, string>> = {
  pending_signature: 'รออัปโหลดฉบับเซ็น',
  signed: 'อัปโหลดฉบับเซ็นแล้ว',
}

/** กลุ่มสีป้ายสถานะ (`04` §8.1) — รอฉบับเซ็น = เหลือง · เซ็นแล้ว = เขียว */
export function substituteReceiptStatusBadgeGroup(status: SubstituteReceiptStatus): 'pending' | 'success' {
  return status === 'signed' ? 'success' : 'pending'
}

/** ป้ายบนคิวอนุมัติ/รายการเบิก — "ใบรับรองแทนใบเสร็จ CRT-2569-0009" */
export function substituteReceiptBadgeText(receiptNumber: string): string {
  return `ใบรับรองแทนใบเสร็จ ${receiptNumber}`
}

/** ชื่อไฟล์ PDF ที่ดาวน์โหลด */
export function substituteReceiptFileName(receiptNumber: string): string {
  return `ใบรับรองแทนใบเสร็จรับเงิน ${receiptNumber}.pdf`
}

/** คำรับรองของผู้จ่ายเงิน (แบบ บก.111) — พิมพ์บน PDF */
export function substituteReceiptCertification(payeeName: string): string {
  return `ข้าพเจ้า ${payeeName} (ผู้เบิกจ่าย) ขอรับรองว่ารายจ่ายข้างต้นไม่อาจเรียกใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทางบริษัทโดยแท้`
}

// ── สิทธิ์เห็น/อัปโหลด (scope ระดับแถว — ตัวบังคับจริงอยู่ชั้นข้อมูล) ─────────────────

export interface SubstituteReceiptViewer {
  userId: string
  isSuperadmin: boolean
  /** ถือ `approve_advance` (การเงิน — เห็นเงินทดรองทั้งองค์กร) */
  canSeeAllAdvances: boolean
  /** ถือ `approve_expense_finance`/`approve_expense_executive` (เห็นคิวอนุมัติทั้งองค์กร) */
  canSeeAllExpenses: boolean
  /** ทีมที่ผู้เรียกดูแล (`team_managers`) — ผู้อนุมัติขั้นทีมเห็นรายการเบิกของทีมตัวเอง */
  managedTeamIds: readonly string[]
}

export interface SubstituteReceiptOwnerRef {
  /** ผู้ใช้เจ้าของ payee (= ผู้จ่ายเงิน) */
  payeeUserId: string
  payeeTeamId: string | null
  link: 'expense' | 'advance'
}

/**
 * เห็นใบ (ดาวน์โหลด PDF/เปิดฉบับเซ็น) ได้ไหม — เจ้าของ · Superadmin · ผู้ถือสิทธิ์ทั้งองค์กรของสายนั้น
 * (เงินทดรอง = การเงิน · ใบเบิก = ขั้นการเงิน/บริหาร) · ผู้จัดการทีมเห็นเฉพาะใบเบิกของทีมที่ดูแล
 * ไม่ผ่าน = ผู้เรียกต้องตอบ 404 (ไม่ leak ว่ามีใบนี้)
 */
export function canViewSubstituteReceipt(viewer: SubstituteReceiptViewer, owner: SubstituteReceiptOwnerRef): boolean {
  if (viewer.isSuperadmin || viewer.userId === owner.payeeUserId) return true
  if (owner.link === 'advance') return viewer.canSeeAllAdvances
  if (viewer.canSeeAllExpenses) return true
  return owner.payeeTeamId !== null && viewer.managedTeamIds.includes(owner.payeeTeamId)
}

/**
 * อัปโหลดฉบับเซ็นได้ไหม — เจ้าของใบ (ผู้จ่ายเงิน) หรือการเงิน/Superadmin ที่เห็นทั้งองค์กร
 * (ผู้จัดการทีมดูได้แต่ไม่อัปโหลดแทน — ลายเซ็นเป็นของผู้จ่ายเงิน)
 */
export function canUploadSignedSubstituteReceipt(
  viewer: SubstituteReceiptViewer,
  owner: SubstituteReceiptOwnerRef,
): boolean {
  if (viewer.isSuperadmin || viewer.userId === owner.payeeUserId) return true
  return owner.link === 'advance' ? viewer.canSeeAllAdvances : viewer.canSeeAllExpenses
}
