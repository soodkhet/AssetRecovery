import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtRatePct, fmtSatang } from '@/lib/format/money'
import { summarizePayoutBatch, type PayoutBatchTotals } from '@/lib/finance/payout-calc'
import { payoutTransferSatang } from '@/lib/finance/advance-offset-calc'
import { advanceOffsetLineLabel } from '@/lib/advances/advance'
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
 * - เลขที่ใบสำคัญจ่าย = **เลขรันจริงต่อปี** จากชุดเลข `payment_voucher` (มติ PO U102) ออกตอนสร้างไฟล์โอน
 *   ครั้งแรก 1 เลขต่อผู้รับเงินต่อรอบ แล้ว snapshot ลง `payout_batch_items.voucher_number` — พิมพ์ซ้ำได้เลขเดิมเสมอ
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

/**
 * ข้อมูลผู้รับเงินบนใบสำคัญจ่าย/สลิป (มติ PO U100/U101) — โหลดจากข้อมูลผู้รับ (U94: คำนำหน้า/ที่อยู่/สาขา)
 * ณ เวลาพิมพ์ (เอกสารภายใน — ไม่ใช่ snapshot) + สรุปจำนวนเคส/วันทำงาน/คืนที่พักของรอบนี้
 */
export interface PayoutPayeeDocInfo {
  displayName: string
  /** เลข 13 หลัก — บุคคลธรรมดา = เลขประจำตัวประชาชน · นิติบุคคล = เลขผู้เสียภาษี */
  taxId: string | null
  isCorporate: boolean
  address: string | null
  /** นิติบุคคลเท่านั้น ("สำนักงานใหญ่"/"สาขาที่ …") */
  branchLabel: string | null
  stats: PayslipStats
}

export interface PayslipStats {
  /** เคสสำเร็จ = เคสที่มีค่าคอมมิชชันในรอบนี้ (นับเคสไม่ซ้ำ) */
  successCases: number
  /** วันทำงานภาคสนาม = วันที่ไม่ซ้ำของแถวรายวัน (ค่าน้ำมันเหมา/เบี้ยเลี้ยง) */
  fieldDays: number
  /** คืนที่พัก = ผลรวมจำนวนคืนของรายการเบิกค่าที่พัก */
  hotelNights: number
}

/** สรุปสถิติของสลิปจากรายการเบิกในรอบ (เฉพาะรายการของผู้รับคนนั้น) — pure */
export function payslipStatsOf(
  expenses: ReadonlyArray<{
    expenseType: string
    caseId: string | null
    fieldDaySettlementId: string | null
    expenseDate: Date
    hotelNights: number
  }>,
): PayslipStats {
  const cases = new Set<string>()
  const days = new Set<string>()
  let hotelNights = 0
  for (const expense of expenses) {
    if (expense.expenseType === 'commission' && expense.caseId !== null) cases.add(expense.caseId)
    if (expense.fieldDaySettlementId !== null) days.add(expense.expenseDate.toISOString().slice(0, 10))
    if (expense.expenseType === 'hotel') hotelNights += expense.hotelNights
  }
  return { successCases: cases.size, fieldDays: days.size, hotelNights }
}

/** ค่าเริ่มต้นเมื่อไม่มีข้อมูลผู้รับ (ข้อมูลเก่า/เทสต์) — ใช้ชื่อจาก snapshot ของรายการ */
function fallbackPayeeInfo(group: PayoutPayeeGroup): PayoutPayeeDocInfo {
  return {
    displayName: group.payeeName,
    taxId: null,
    isCorporate: false,
    address: null,
    branchLabel: null,
    stats: { successCases: 0, fieldDays: 0, hotelNights: 0 },
  }
}

function orDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? EMPTY : trimmed
}

// ── ยามสถานะของเอกสารแต่ละใบ ────────────────────────────────────────────────

/**
 * `draft` เป็น transient state ที่ยังรวบรวมรายการไม่ครบ (`17` §7.1) — เอกสารทุกใบต้องรอ `checking`
 * ขึ้นไป ไม่งั้นยอดบนกระดาษจะไม่ตรงกับรอบจริง
 * · `cancelled` (มติ PO U67) — ไม่มีการจ่ายจริง ⇒ ห้ามออกเอกสารทุกใบ (กันใช้เป็นหลักฐานผิด)
 */
export function assertPayoutDocReady(status: PayoutBatchStatus): void {
  if (status !== 'draft' && status !== 'cancelled') return
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
  // มติ PO U67 — รอบที่ยกเลิกแล้วไม่ใช่ "ยังไม่สร้างไฟล์" แต่เป็นสถานะที่ออกเอกสารไม่ได้เลย
  if (status === 'cancelled') assertPayoutDocReady(status)
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
  /** มติ PO U30 — ยอดหักคืนเงินทดรองรวมของคนนี้ (snapshot) และยอดโอนจริง = net − ยอดหัก */
  advanceOffsetSatang: number
  transferSatang: number
  /** บรรทัด "หักคืนเงินทดรอง ADV-xxx" ต่อเงินทดรอง (รวมยอดข้ามหลายบรรทัดในรอบ) */
  offsetLines: ReadonlyArray<{ label: string; amountSatang: number }>
}

/** รวมบรรทัดหักคืนเงินทดรองของรายการกลุ่มหนึ่ง — ต่อเงินทดรอง ลำดับตามที่พบ */
function collectOffsetLines(items: readonly PayoutBatchItemDto[]): Array<{ label: string; amountSatang: number }> {
  const byAdvance = new Map<string, { advanceRef: string; amountSatang: number }>()
  for (const item of items) {
    for (const offset of item.advanceOffsets) {
      const current = byAdvance.get(offset.advanceId)
      byAdvance.set(offset.advanceId, {
        advanceRef: offset.advanceRef,
        amountSatang: (current?.amountSatang ?? 0) + offset.amountSatang,
      })
    }
  }
  return [...byAdvance.values()].map((entry) => ({
    label: advanceOffsetLineLabel(entry.advanceRef),
    amountSatang: entry.amountSatang,
  }))
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
    const totals = summarizePayoutBatch(bucket)
    const advanceOffsetSatang = bucket.reduce((sum, item) => sum + item.advanceOffsetSatang, 0)
    return {
      payeeId: first.payeeId,
      payeeName: first.payeeName,
      teamName: first.teamName,
      bankName: first.bankName,
      accountNumberMasked: first.accountNumberMasked,
      whtPctSnapshot: rates.size === 1 ? (first.whtPctSnapshot ?? null) : null,
      items: bucket,
      totals,
      advanceOffsetSatang,
      transferSatang: payoutTransferSatang(totals.netSatang, advanceOffsetSatang),
      offsetLines: collectOffsetLines(bucket),
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
  /** มติ PO U30 — ยอดโอนจริง (= net เมื่อไม่มีการหัก) + ยอดหักคืนเงินทดรอง (`null` = ไม่มี) */
  transferText: string
  offsetText: string | null
  /** ยอดหักคืนเงินทดรองในตาราง (ไม่มี = `0.00`) */
  offsetCellText: string
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
  totalTransferText: string
  /** `null` = ทั้งรอบไม่มีการหักคืนเงินทดรอง */
  totalOffsetText: string | null
  totalOffsetCellText: string
  payeeCountText: string
  /** วันเวลาที่พิมพ์ (พ.ศ.) — มุมขวาของแถบหัวเอกสารภายใน (มติ PO U100 ข้อ 9) */
  printedAtLabel: string
  note: string
}

export function buildPayoutSummaryDoc(
  batch: PayoutBatchDetailDto,
  issuer: PayoutDocIssuer,
  printedAt: Date = new Date(),
): PayoutSummaryDoc {
  const groups = groupPayoutItemsByPayee(batch.items)
  // ยอดรวมของทั้งรอบคิดจาก "รายการทั้งหมด" ไม่ใช่ผลบวกของยอดกลุ่ม — ยามของ `22` §6.10
  // จะจับได้ทันทีถ้ามีรายการใดที่ net ≠ gross − wht
  const totals = summarizePayoutBatch(batch.items)
  const totalOffset = groups.reduce((sum, group) => sum + group.advanceOffsetSatang, 0)

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
      transferText: fmtSatang(group.transferSatang),
      offsetText: group.advanceOffsetSatang === 0 ? null : fmtSatang(group.advanceOffsetSatang),
      offsetCellText: fmtSatang(group.advanceOffsetSatang),
    })),
    itemCountText: `${fmtCount(totals.itemCount)} รายการ`,
    totalGrossText: fmtSatang(totals.grossSatang),
    totalWhtText: fmtSatang(totals.whtSatang),
    totalNetText: fmtSatang(totals.netSatang),
    totalTransferText: fmtSatang(payoutTransferSatang(totals.netSatang, totalOffset)),
    totalOffsetText: totalOffset === 0 ? null : fmtSatang(totalOffset),
    totalOffsetCellText: fmtSatang(totalOffset),
    payeeCountText: `${fmtCount(groups.length)} ราย`,
    printedAtLabel: fmtDateTime(printedAt),
    note: 'ใช้รูปแบบไฟล์ธนาคารที่ผ่านการทดสอบแล้วเท่านั้นในการตัดโอนจริง',
  }
}

// ── ② ใบสำคัญจ่าย (`05_payment_voucher.pdf`) ────────────────────────────────

/** เลขที่ใบสำคัญจ่ายของผู้รับในรอบ = snapshot ของรายการ (ทุกรายการของผู้รับเดียวกันได้เลขเดียวกัน) */
export function voucherNumberOf(items: readonly Pick<PayoutBatchItemDto, 'voucherNumber'>[]): string | null {
  return items.find((item) => item.voucherNumber !== null)?.voucherNumber ?? null
}

/** แถวรายการบนใบสำคัญจ่าย/สลิป — `detail` = บรรทัดรองสีเทา */
export interface PayoutDocLine {
  description: string
  detail: string | null
  amountText: string
}

export interface PaymentVoucherDoc {
  title: string
  titleEn: string
  headerNote: string
  issuer: PayoutDocIssuer
  voucherNo: string
  payeeName: string
  /** ข้อมูลผู้รับในกล่อง "จ่ายให้" (มติ PO U100) */
  payee: PayoutPayeeDocInfo
  teamName: string
  /** รายการรวมตามประเภทรายการเบิก (มติ PO U100) */
  lines: readonly PayoutDocLine[]
  /** "หัก ภาษี ณ ที่จ่าย 3%" (+ ฐานภาษีเมื่อมีรายการนอกฐาน — ค่าตั้ง U3) */
  whtLabel: string
  /** ยอดหักในวงเล็บ `(231.00)` · ไม่หัก = `0.00` */
  whtDeductText: string
  /** "โอนเข้าบัญชี …" */
  paymentChannelText: string
  signers: readonly string[]
  footnote: string
  bankLine: string
  description: string
  batchName: string
  methodLabel: string
  payDateLabel: string
  grossText: string
  whtText: string
  /** สุทธิหลังหักภาษี (ก่อนหักคืนเงินทดรอง) */
  netAfterWhtText: string
  /** มติ PO U30 — บรรทัด "หักคืนเงินทดรอง ADV-xxx" (ว่าง = ไม่มีการหัก) */
  offsetLines: ReadonlyArray<{ label: string; amountText: string }>
  /** จำนวนเงินที่จ่ายจริง = ยอดโอน (หลังหักคืนเงินทดรอง) */
  netText: string
  netInWords: string
  /** ข้อความเตือนเมื่อยังไม่ยืนยันว่าเงินออกจริง (`17` §9 — ยืนยันจากไฟล์ 35 หรือ manual) */
  pendingNote: string | null
}

/** ตัวอ้างอิงรอบที่พิมพ์บนเอกสาร — ใช้ idempotency key ถ้ามี (ตรงกับไฟล์ที่ส่งธนาคาร) */
function batchRef(batch: PayoutBatchDetailDto): string {
  return batch.idempotencyKey ?? batch.id.slice(0, 8).toUpperCase()
}

export function buildPaymentVoucherDocs(
  batch: PayoutBatchDetailDto,
  issuer: PayoutDocIssuer,
  payees: ReadonlyMap<string, PayoutPayeeDocInfo> = new Map(),
): PaymentVoucherDoc[] {
  const payDate = batch.paymentFileGeneratedAt ?? batch.createdAt

  return groupPayoutItemsByPayee(batch.items).map((group) => ({
    title: PAYMENT_VOUCHER_TITLE,
    titleEn: 'Payment Voucher',
    headerNote: INTERNAL_DOC_NOTE.voucher,
    issuer,
    voucherNo: orDash(voucherNumberOf(group.items)),
    payeeName: group.payeeName,
    payee: payees.get(group.payeeId) ?? fallbackPayeeInfo(group),
    teamName: orDash(group.teamName),
    lines: voucherLinesOf(group.items),
    whtLabel: whtLineLabel(group),
    whtDeductText: group.totals.whtSatang === 0 ? fmtSatang(0) : `(${fmtSatang(group.totals.whtSatang)})`,
    paymentChannelText: `โอนเข้าบัญชี ${payeeBankLine(group)}`,
    signers: ['ผู้จัดทำ', 'ผู้อนุมัติ', 'ผู้รับเงิน'],
    footnote: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ออกแยกต่างหาก',
    bankLine: payeeBankLine(group),
    description: `${describeVoucherItems(group.items)} รอบ ${batch.name}`,
    batchName: batch.name,
    methodLabel: 'โอนผ่านธนาคาร (Bank Transfer)',
    payDateLabel: fmtDate(payDate),
    grossText: fmtSatang(group.totals.grossSatang),
    whtText: fmtSatang(group.totals.whtSatang),
    netAfterWhtText: fmtSatang(group.totals.netSatang),
    offsetLines: group.offsetLines.map((line) => ({ label: line.label, amountText: `(${fmtSatang(line.amountSatang)})` })),
    netText: fmtSatang(group.transferSatang),
    netInWords: bahtInWords(group.transferSatang),
    pendingNote:
      batch.status === 'completed'
        ? null
        : 'รอบจ่ายนี้ยังไม่ถูกยืนยันว่าจ่ายสำเร็จ — ใบสำคัญจ่ายฉบับนี้ใช้ประกอบการตรวจสอบก่อนกระทบยอดธนาคาร',
  }))
}

function payeeBankLine(group: PayoutPayeeGroup): string {
  return group.bankName === null && group.accountNumberMasked === null
    ? EMPTY
    : `${orDash(group.bankName)} เลขที่บัญชี ${orDash(group.accountNumberMasked)}`
}

/**
 * ป้ายแถวหัก ณ ที่จ่าย — อัตรา snapshot + **ฐานภาษีตามที่ระบบคิดจริง** เมื่อมีรายการนอกฐาน (ค่าตั้ง U3 เช่น
 * ค่าที่พักตามใบเสร็จนามบริษัท) · ยอดหักเป็น snapshot ของรายการ (ไม่คิดใหม่บนเอกสาร — Rule 01)
 */
function whtLineLabel(group: PayoutPayeeGroup): string {
  const rate = group.whtPctSnapshot === null || group.totals.whtSatang === 0 ? '' : ` ${fmtRatePct(group.whtPctSnapshot)}`
  const baseSatang = group.items
    .filter((item) => item.source === 'expense' && item.whtBaseIncluded)
    .reduce((sum, item) => sum + item.grossSatang, 0)
  const base = group.totals.whtSatang > 0 && baseSatang !== group.totals.grossSatang ? ` (ฐานภาษี ${fmtSatang(baseSatang)})` : ''
  return `หัก ภาษี ณ ที่จ่าย${rate}${base}`
}

/** แถวรายการของใบสำคัญจ่าย — รวมตามประเภทรายการเบิก (+ แยกรายการนอกฐานภาษี/เงินทดรองจ่าย) ลำดับตามที่พบ */
function voucherLinesOf(items: readonly PayoutBatchItemDto[]): PayoutDocLine[] {
  const groups = new Map<string, { description: string; note: string | null; count: number; grossSatang: number }>()
  for (const item of items) {
    const description = item.description.trim() === '' ? 'ค่าตอบแทน' : item.description.trim()
    const note =
      item.source === 'advance'
        ? 'เงินทดรองจ่าย — ไม่หักภาษี ณ ที่จ่าย'
        : item.whtBaseIncluded
          ? null
          : 'ไม่อยู่ในฐานภาษีหัก ณ ที่จ่าย'
    const key = `${description}|${note ?? ''}`
    const bucket = groups.get(key)
    if (bucket === undefined) groups.set(key, { description, note, count: 1, grossSatang: item.grossSatang })
    else {
      bucket.count += 1
      bucket.grossSatang += item.grossSatang
    }
  }
  return [...groups.values()].map((group) => ({
    description: group.description,
    detail: [`${fmtCount(group.count)} รายการ`, group.note].filter((part): part is string => part !== null).join(' · '),
    amountText: fmtSatang(group.grossSatang),
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

/** ช่องสรุปบนสลิป (มติ PO U100) — "เคสสำเร็จ 6 เคส" ฯลฯ */
export interface PayslipStatTile {
  label: string
  value: string
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
  /** เลขที่ใบสำคัญจ่ายของคนนี้ในรอบ (ชุดเดียวกับ `buildPaymentVoucherDocs`) */
  voucherNo: string
  issuedAtLabel: string
  stats: readonly PayslipStatTile[]
  /** จำนวนเงินตัวอักษรของยอดโอนสุทธิ */
  netInWords: string
  paymentChannelText: string
  rows: readonly PayslipDocRow[]
  grossText: string
  whtLabel: string
  /** ยอดหักแสดงในวงเล็บตามตัวอย่าง 06 — `(255.90)` */
  whtText: string
  /** มติ PO U30 — บรรทัด "หักคืนเงินทดรอง ADV-xxx" หลังหักภาษี (ว่าง = ไม่มีการหัก) */
  offsetLines: ReadonlyArray<{ label: string; amountText: string }>
  /** ยอดโอนสุทธิ (หลังหักภาษีและหักคืนเงินทดรอง) */
  netText: string
  note: string
}

export function buildPayslipDocs(
  batch: PayoutBatchDetailDto,
  issuer: PayoutDocIssuer,
  payees: ReadonlyMap<string, PayoutPayeeDocInfo> = new Map(),
): PayslipDoc[] {
  const ref = batchRef(batch)

  return groupPayoutItemsByPayee(batch.items).map((group) => {
    const info = payees.get(group.payeeId) ?? fallbackPayeeInfo(group)
    return {
    title: PAYSLIP_TITLE,
    titleEn: 'Payslip',
    headerNote: INTERNAL_DOC_NOTE.payslip,
    issuer,
    payeeName: info.displayName,
    teamName: orDash(group.teamName),
    batchName: batch.name,
    batchRef: ref,
    voucherNo: orDash(voucherNumberOf(group.items)),
    issuedAtLabel: fmtDate(batch.paymentFileGeneratedAt ?? batch.createdAt),
    stats: [
      { label: 'เคสสำเร็จ', value: `${fmtCount(info.stats.successCases)} เคส` },
      { label: 'วันทำงานภาคสนาม', value: `${fmtCount(info.stats.fieldDays)} วัน` },
      { label: 'คืนที่พัก', value: `${fmtCount(info.stats.hotelNights)} คืน` },
      { label: 'ยอดโอนสุทธิ', value: `${fmtSatang(group.transferSatang)} บาท` },
    ],
    netInWords: bahtInWords(group.transferSatang),
    paymentChannelText: `โอนเข้าบัญชี ${payeeBankLine(group)}`,
    rows: group.items.map((item) => ({
      description: payslipRowLabel(item),
      amountText: fmtSatang(item.grossSatang),
    })),
    grossText: fmtSatang(group.totals.grossSatang),
    whtLabel:
      group.whtPctSnapshot === null || group.totals.whtSatang === 0
        ? 'หักภาษี ณ ที่จ่าย'
        : `หักภาษี ณ ที่จ่าย (${fmtRatePct(group.whtPctSnapshot)})`,
    whtText: group.totals.whtSatang === 0 ? fmtSatang(0) : `(${fmtSatang(group.totals.whtSatang)})`,
    offsetLines: group.offsetLines.map((line) => ({ label: line.label, amountText: `(${fmtSatang(line.amountSatang)})` })),
    netText: fmtSatang(group.transferSatang),
    note:
      'เอกสารนี้ออกโดยระบบ ไม่ต้องลงลายมือชื่อ · หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ออกแยกต่างหาก · ' +
      'หากรายการไม่ถูกต้องโปรดติดต่อฝ่ายการเงิน',
    }
  })
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
