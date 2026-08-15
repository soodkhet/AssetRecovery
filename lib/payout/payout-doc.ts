import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtPercent, fmtSatang } from '@/lib/format/money'
import { summarizePayoutBatch, type PayoutBatchTotals } from '@/lib/finance/payout-calc'
import type { PayoutBatchStatus } from '@/lib/generated/prisma/enums'
import { bahtInWords } from '@/lib/payout/baht-text'
import { PayoutError } from '@/lib/payout/errors'
import { assertHasItemsToPay, PAYOUT_SIDE_LABEL, PAYOUT_STATUS_LABEL } from '@/lib/payout/payout'
import type { PayoutBatchDetailDto, PayoutBatchItemDto } from '@/lib/payout/types'

/**
 * แบบข้อมูลของ **เอกสารภายใน 3 ใบของรอบจ่ายเงิน** (`28` §6.1 · `13` §6.7) — **pure ล้วน**
 *
 * | เอกสาร | ตัวอย่าง | ใช้เมื่อ |
 * |---|---|---|
 * | สรุปรอบจ่ายเงิน (Payout Batch Summary) | `04_payout_batch_summary.pdf` | ก่อนโอนเงินจริง |
 * | ใบสำคัญจ่าย (Payment Voucher) | `05_payment_voucher.pdf` | หลังสร้างไฟล์โอน/จ่ายสำเร็จ |
 * | สลิปค่าตอบแทน (Compensation Statement) | `06_payslip.pdf` | สรุปค่าตอบแทนต่อคน/รอบ |
 *
 * ### กติกาที่ไฟล์นี้ยึด
 * - **ยอดทุกช่องมาจาก snapshot ของรอบ** (`payout_batch_items`) — ที่นี่ทำได้แค่ *รวม* ด้วย
 *   `summarizePayoutBatch()` (`22` §6.10) ซึ่งมียามตรวจ `net = gross − wht` ของทุกรายการให้ด้วย
 *   **ห้ามคิดสูตร WHT/VAT ใหม่บนเอกสาร** (Rule 01 · `22` เป็น SSOT ของสูตร)
 * - วันที่ทุกจุดเป็น **พ.ศ.** ผ่าน `fmtDate`/`fmtDateTime` — component PDF ห้าม format ซ้ำ
 * - เงินแปลงเป็นข้อความด้วย `fmtSatang()` (ไม่มีสัญลักษณ์ ฿ ตามตัวอย่าง 04–06)
 *
 * ⚠️ `02` §8 **ไม่มีตารางเดินเลขใบสำคัญจ่าย** (ต่างจากใบกำกับภาษีที่มีใน `13` §6.12) และ `28` §6.1
 *    จัดใบนี้เป็น "เอกสารภายใน ไม่มีข้อกำหนดทางกฎหมาย" ⇒ เลขที่ใบสำคัญจ่าย **derive จากรอบจ่าย**
 *    แบบ deterministic (`voucherNumber()`) ไม่เดินเลขลง DB — พิมพ์ซ้ำได้เลขเดิมเสมอ
 *    ถ้าภายหลังบัญชีต้องการเลขรันจริง ต้องเพิ่มตารางใน `02` + migration ก่อน
 */

export const PAYOUT_SUMMARY_TITLE = 'สรุปรอบจ่ายเงิน'
export const PAYMENT_VOUCHER_TITLE = 'ใบสำคัญจ่าย'
export const PAYSLIP_TITLE = 'สลิปค่าตอบแทน'

export const INTERNAL_DOC_NOTE = {
  summary: 'เอกสารภายใน — ใช้ตรวจสอบก่อนตัดโอนเงินจริง',
  voucher: 'เอกสารภายใน — หลักฐานการจ่ายเงิน',
  payslip: 'เอกสารภายใน — สรุปค่าตอบแทน',
} as const

const EMPTY = '—'

/** ผู้ออกเอกสาร = องค์กรเจ้าของระบบ (`organizations`) — โครงเดียวกับใบส่งมอบของ 2.13 */
export interface PayoutDocIssuer {
  name: string
  address: string | null
  taxId: string | null
  phone: string | null
}

function orDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? EMPTY : trimmed
}

// ── ยามสถานะของเอกสารแต่ละใบ ────────────────────────────────────────────────

/**
 * `draft` เป็น transient state ที่ยังรวบรวมรายการไม่ครบ (`17` §7.1) — เอกสารทุกใบต้องรอ `checking`
 * ขึ้นไป ไม่งั้นยอดบนกระดาษจะไม่ตรงกับรอบจริง
 */
export function assertPayoutDocReady(status: PayoutBatchStatus): void {
  if (status !== 'draft') return
  throw new PayoutError('PAYOUT_BATCH_INVALID_STATUS', {
    detail: `document requested at ${status}`,
    context: { currentStatus: status },
  })
}

/**
 * ใบสำคัญจ่ายเป็นหลักฐาน**การจ่ายเงิน** (`13` §6.7 "หลังจ่ายเงินสำเร็จ") ⇒ ต้องมีวันที่จ่ายจริง
 * บนเอกสาร ซึ่งเกิดขึ้นครั้งแรกตอนสร้างไฟล์โอน ⇒ เปิดให้ออกได้ตั้งแต่ `file_generated`
 * (รอบที่ยังไม่ยืนยันจ่ายจะมีข้อความกำกับว่ายังรอยืนยัน ไม่ใช่ซ่อนเอกสาร)
 */
export function assertVoucherReady(status: PayoutBatchStatus): void {
  if (status === 'file_generated' || status === 'completed') return
  throw new PayoutError('PAYMENT_FILE_NOT_GENERATED', {
    detail: `voucher requested at ${status}`,
    context: { currentStatus: status },
  })
}

/**
 * จำกัดเอกสารให้เหลือของผู้รับเงินรายเดียว (`?payeeId=`) — ไม่ระบุ = ทั้งรอบ
 * รอบ/คนที่ไม่มีรายการเลย = `NO_ITEMS_TO_PAY` (ไม่ออกกระดาษเปล่าให้เข้าใจผิดว่าไม่มียอด)
 */
export function selectPayoutDocItems(
  batch: PayoutBatchDetailDto,
  payeeId: string | undefined,
): PayoutBatchDetailDto {
  if (payeeId === undefined) {
    assertHasItemsToPay(batch.items.length)
    return batch
  }
  const items = batch.items.filter((item) => item.payeeId === payeeId)
  assertHasItemsToPay(items.length)
  return { ...batch, items }
}

// ── จัดกลุ่มรายการตามผู้รับเงิน ─────────────────────────────────────────────

export interface PayoutPayeeGroup {
  payeeId: string
  payeeName: string
  teamName: string | null
  bankName: string | null
  accountNumberMasked: string | null
  /** อัตรา WHT ที่ใช้จริงกับทุกรายการของคนนี้ — ไม่เท่ากันทุกรายการ = `null` (ต้องอ่านรายบรรทัด) */
  whtPctSnapshot: number | null
  items: readonly PayoutBatchItemDto[]
  totals: PayoutBatchTotals
}

/**
 * 1 คน = 1 ใบสำคัญจ่าย / 1 สลิป ต่อรอบ (`28` §6.1 "สรุปค่าตอบแทนต่อพนักงาน/รอบ")
 * — ลำดับกลุ่มยึดลำดับรายการแรกที่พบ เพื่อให้เลขที่ใบสำคัญจ่ายคงที่ทุกครั้งที่พิมพ์
 */
export function groupPayoutItemsByPayee(items: readonly PayoutBatchItemDto[]): PayoutPayeeGroup[] {
  const groups = new Map<string, PayoutBatchItemDto[]>()
  for (const item of items) {
    const bucket = groups.get(item.payeeId)
    if (bucket === undefined) groups.set(item.payeeId, [item])
    else bucket.push(item)
  }

  return [...groups.values()].map((bucket) => {
    // ทุก bucket ถูกสร้างพร้อมรายการแรกเสมอ ⇒ ไม่มีทางว่าง (ยามไว้ให้ type แน่นอนเท่านั้น)
    const first = bucket[0]
    if (first === undefined) throw new RangeError('กลุ่มผู้รับเงินต้องมีอย่างน้อย 1 รายการ')
    const rates = new Set(bucket.map((item) => item.whtPctSnapshot))
    return {
      payeeId: first.payeeId,
      payeeName: first.payeeName,
      teamName: first.teamName,
      bankName: first.bankName,
      accountNumberMasked: first.accountNumberMasked,
      whtPctSnapshot: rates.size === 1 ? (first.whtPctSnapshot ?? null) : null,
      items: bucket,
      totals: summarizePayoutBatch(bucket),
    }
  })
}

// ── ① สรุปรอบจ่ายเงิน (`04_payout_batch_summary.pdf`) ───────────────────────

export interface PayoutSummaryDocRow {
  no: number
  payeeName: string
  teamName: string
  itemCountText: string
  grossText: string
  whtText: string
  netText: string
}

export interface PayoutSummaryDoc {
  title: string
  titleEn: string
  headerNote: string
  issuer: PayoutDocIssuer
  batchName: string
  sideLabel: string
  statusLabel: string
  createdAtLabel: string
  /** วันที่บนหัวเอกสาร — วันสร้างไฟล์โอนถ้ามี ไม่งั้นวันที่สร้างรอบ */
  issuedAtLabel: string
  bankAccountLabel: string
  paymentFileLabel: string
  idempotencyKey: string
  rows: readonly PayoutSummaryDocRow[]
  itemCountText: string
  totalGrossText: string
  totalWhtText: string
  totalNetText: string
  note: string
}

export function buildPayoutSummaryDoc(
  batch: PayoutBatchDetailDto,
  issuer: PayoutDocIssuer,
): PayoutSummaryDoc {
  const groups = groupPayoutItemsByPayee(batch.items)
  // ยอดรวมของทั้งรอบคิดจาก "รายการทั้งหมด" ไม่ใช่ผลบวกของยอดกลุ่ม — ยามของ `22` §6.10
  // จะจับได้ทันทีถ้ามีรายการใดที่ net ≠ gross − wht
  const totals = summarizePayoutBatch(batch.items)

  return {
    title: PAYOUT_SUMMARY_TITLE,
    titleEn: 'Payout Batch Summary',
    headerNote: INTERNAL_DOC_NOTE.summary,
    issuer,
    batchName: batch.name,
    sideLabel: PAYOUT_SIDE_LABEL[batch.side],
    statusLabel: PAYOUT_STATUS_LABEL[batch.status],
    createdAtLabel: fmtDate(batch.createdAt),
    issuedAtLabel: fmtDate(batch.paymentFileGeneratedAt ?? batch.createdAt),
    bankAccountLabel: orDash(batch.bankAccountLabel),
    paymentFileLabel:
      batch.paymentFileGeneratedAt === null
        ? 'ยังไม่ได้สร้างไฟล์โอน'
        : `สร้างไฟล์โอนเมื่อ ${fmtDateTime(batch.paymentFileGeneratedAt)}`,
    idempotencyKey: orDash(batch.idempotencyKey),
    rows: groups.map((group, index) => ({
      no: index + 1,
      payeeName: group.payeeName,
      teamName: orDash(group.teamName),
      itemCountText: `${fmtCount(group.items.length)} รายการ`,
      grossText: fmtSatang(group.totals.grossSatang),
      whtText: fmtSatang(group.totals.whtSatang),
      netText: fmtSatang(group.totals.netSatang),
    })),
    itemCountText: `${fmtCount(totals.itemCount)} รายการ`,
    totalGrossText: fmtSatang(totals.grossSatang),
    totalWhtText: fmtSatang(totals.whtSatang),
    totalNetText: fmtSatang(totals.netSatang),
    note: 'ใช้รูปแบบไฟล์ธนาคารที่ test_status = passed เท่านั้นในการตัดโอนจริง (BANK_FILE_NOT_TESTED — ไฟล์ 13 §6.8)',
  }
}

// ── ② ใบสำคัญจ่าย (`05_payment_voucher.pdf`) ────────────────────────────────

/**
 * เลขที่ใบสำคัญจ่าย — deterministic จาก "รหัสอ้างอิงรอบ + ลำดับผู้รับเงินในรอบ"
 * (ดูเหตุผลที่ไม่เดินเลขลง DB ที่หัวไฟล์)
 */
export function voucherNumber(input: { batchRef: string; beYear: number; index: number }): string {
  return `PV-${input.beYear}-${input.batchRef}-${String(input.index).padStart(3, '0')}`
}

export interface PaymentVoucherDoc {
  title: string
  titleEn: string
  headerNote: string
  issuer: PayoutDocIssuer
  voucherNo: string
  payeeName: string
  bankLine: string
  description: string
  batchName: string
  methodLabel: string
  payDateLabel: string
  grossText: string
  whtText: string
  netText: string
  netInWords: string
  /** ข้อความเตือนเมื่อยังไม่ยืนยันว่าเงินออกจริง (`17` §9 — ยืนยันจากไฟล์ 35 หรือ manual) */
  pendingNote: string | null
}

/** ตัวอ้างอิงรอบที่พิมพ์บนเอกสาร — ใช้ idempotency key ถ้ามี (ตรงกับไฟล์ที่ส่งธนาคาร) */
function batchRef(batch: PayoutBatchDetailDto): string {
  return batch.idempotencyKey ?? batch.id.slice(0, 8).toUpperCase()
}

/** ปี พ.ศ. ของวันที่ (`fmtDate` คืน `DD/MM/YYYY` พ.ศ. อยู่แล้ว — อ่านปีจากตรงนั้นที่เดียว) */
function beYearOf(iso: string): number {
  return Number(fmtDate(iso).split('/')[2])
}

export function buildPaymentVoucherDocs(
  batch: PayoutBatchDetailDto,
  issuer: PayoutDocIssuer,
): PaymentVoucherDoc[] {
  const payDate = batch.paymentFileGeneratedAt ?? batch.createdAt
  const ref = batchRef(batch)
  const beYear = beYearOf(payDate)

  return groupPayoutItemsByPayee(batch.items).map((group, index) => ({
    title: PAYMENT_VOUCHER_TITLE,
    titleEn: 'Payment Voucher',
    headerNote: INTERNAL_DOC_NOTE.voucher,
    issuer,
    voucherNo: voucherNumber({ batchRef: ref, beYear, index: index + 1 }),
    payeeName: group.payeeName,
    bankLine:
      group.bankName === null && group.accountNumberMasked === null
        ? EMPTY
        : `${orDash(group.bankName)} เลขที่บัญชี ${orDash(group.accountNumberMasked)}`,
    description: `${describeVoucherItems(group.items)} รอบ ${batch.name}`,
    batchName: batch.name,
    methodLabel: 'โอนผ่านธนาคาร (Bank Transfer)',
    payDateLabel: fmtDate(payDate),
    grossText: fmtSatang(group.totals.grossSatang),
    whtText: fmtSatang(group.totals.whtSatang),
    netText: fmtSatang(group.totals.netSatang),
    netInWords: bahtInWords(group.totals.netSatang),
    pendingNote:
      batch.status === 'completed'
        ? null
        : 'รอบจ่ายนี้ยังไม่ถูกยืนยันว่าจ่ายสำเร็จ — ใบสำคัญจ่ายฉบับนี้ใช้ประกอบการตรวจสอบก่อนกระทบยอดธนาคาร',
  }))
}

/** ข้อความ "รายการ / วัตถุประสงค์" — รวมประเภทที่ไม่ซ้ำกันของคนนั้นในรอบ */
function describeVoucherItems(items: readonly PayoutBatchItemDto[]): string {
  const labels = [...new Set(items.map((item) => item.description.trim()).filter((text) => text !== ''))]
  return labels.length === 0 ? 'ค่าตอบแทนงานติดตามทรัพย์สินคืน' : labels.join(' · ')
}

// ── ③ สลิปค่าตอบแทน (`06_payslip.pdf`) ──────────────────────────────────────

export interface PayslipDocRow {
  description: string
  amountText: string
}

export interface PayslipDoc {
  title: string
  titleEn: string
  headerNote: string
  issuer: PayoutDocIssuer
  payeeName: string
  teamName: string
  batchName: string
  batchRef: string
  issuedAtLabel: string
  rows: readonly PayslipDocRow[]
  grossText: string
  whtLabel: string
  /** ยอดหักแสดงในวงเล็บตามตัวอย่าง 06 — `(255.90)` */
  whtText: string
  netText: string
  note: string
}

export function buildPayslipDocs(batch: PayoutBatchDetailDto, issuer: PayoutDocIssuer): PayslipDoc[] {
  const ref = batchRef(batch)

  return groupPayoutItemsByPayee(batch.items).map((group) => ({
    title: PAYSLIP_TITLE,
    titleEn: 'Compensation Statement',
    headerNote: INTERNAL_DOC_NOTE.payslip,
    issuer,
    payeeName: group.payeeName,
    teamName: orDash(group.teamName),
    batchName: batch.name,
    batchRef: ref,
    issuedAtLabel: fmtDate(batch.paymentFileGeneratedAt ?? batch.createdAt),
    rows: group.items.map((item) => ({
      description: payslipRowLabel(item),
      amountText: fmtSatang(item.grossSatang),
    })),
    grossText: fmtSatang(group.totals.grossSatang),
    whtLabel:
      group.whtPctSnapshot === null || group.totals.whtSatang === 0
        ? 'หักภาษี ณ ที่จ่าย'
        : `หักภาษี ณ ที่จ่าย (${fmtPercent(group.whtPctSnapshot)})`,
    whtText: group.totals.whtSatang === 0 ? fmtSatang(0) : `(${fmtSatang(group.totals.whtSatang)})`,
    netText: fmtSatang(group.totals.netSatang),
    note: 'หนังสือรับรองหัก ณ ที่จ่ายฉบับทางการ (50 ทวิ) ออกแยกต่างหากตามไฟล์ 33',
  }))
}

/**
 * บรรทัดรายการบนสลิป — ต่อท้ายเลขสัญญา/รอบติดตามเมื่อเป็นค่าตอบแทนจากเคส (B3: recycle จ่ายซ้ำได้
 * แต่ต้องแยกรอบ ⇒ ต้องอ่านออกว่าเป็นรอบติดตามไหน) · เงินทดรองกำกับไว้ว่าไม่ใช่เงินได้
 */
function payslipRowLabel(item: PayoutBatchItemDto): string {
  const base = item.description.trim() === '' ? 'ค่าตอบแทน' : item.description.trim()
  if (item.source === 'advance') return `${base} (เงินทดรองจ่าย — ไม่หักภาษี ณ ที่จ่าย)`
  if (item.caseRef === null) return base
  return `${base} — เคส ${item.caseRef}${item.trackingRound > 1 ? ` (รอบติดตามที่ ${item.trackingRound})` : ''}`
}
