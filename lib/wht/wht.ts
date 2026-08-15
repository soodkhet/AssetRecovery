import { nextPeriodKey, periodYearCe, type PeriodKey } from '@/lib/accounting/period'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatang } from '@/lib/format/money'
import type {
  PayeeType,
  WhtCertificateStatus,
  WhtDeliveryFormat,
  WhtFilingForm,
  WhtFilingStatus,
} from '@/lib/generated/prisma/enums'
import { bahtInWords } from '@/lib/payout/baht-text'
import { toBangkokDateOnly } from '@/lib/revenue/revenue'
import { formatInvoiceNumber, type NumberingFormat } from '@/lib/settings/numbering'
import { WhtError } from '@/lib/wht/errors'

/**
 * กติกาของหนังสือรับรองหัก ณ ที่จ่าย + สรุปรอบนำส่ง (ไฟล์ 33) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### กติกาที่ห้ามหลุด
 * - **1 รายการจ่ายที่มีการหักภาษี = 1 ใบรับรอง** และเกิดจาก payout ที่ `completed` เท่านั้น
 *   (`33` §9 · §17) — รายการที่ `wht = 0` (เช่นเงินทดรองจ่าย A4) **ไม่ออกใบ** เพราะใบ 50 ทวิ
 *   คือหลักฐาน "ภาษีที่หักไว้" ไม่มีภาษีก็ไม่มีอะไรให้รับรอง (ดู `shouldIssueCertificate()`)
 * - **ใบที่ออกแล้วแก้ยอดไม่ได้** — ผิดต้อง `active → cancelled` (terminal, ห้ามลบ/ห้าม reverse)
 *   แล้วออกใบใหม่ที่อ้าง `replaces_certificate_id` กลับฉบับเดิม (`33` §10 · `02` §13)
 * - **ใบที่ `cancelled` ไม่ถูกนับใน `pnd3_total`/`pnd53_total`** (`33` §9 · §16) ⇒ ทุกการรวมยอด
 *   ต้องผ่าน `summarizeFilingTotals()` ตัวเดียว ห้าม `reduce` เองที่อื่น
 * - **`FILING_OVERDUE_WARNING` เป็นคำเตือน ไม่ block** (`33` §11 · Rule 04 — 1 ใน warn-only ของ `24`)
 * - อัตรา/ฐาน WHT **ไม่ได้คิดที่นี่** — คิดตอนสร้างรอบจ่าย (ไฟล์ 17 ผ่าน `calculateWhtForPayee()`)
 *   โมดูลนี้อ่าน snapshot ของ `payout_batch_items` มารับรองเท่านั้น (Rule 01)
 *
 * ### สิ่งที่ยังไม่มีในสคีมา (`02` ชนะไฟล์ 33 ตามลำดับเอกสารขัดกัน — `02_OPEN_DECISIONS` D11/D15)
 * - ไม่มีตัวเดินเลข `wht_certificate_seq` ใน `organizations` (มีแต่ของใบกำกับภาษี) ⇒ เลขที่ derive
 *   จากใบที่ออกไปแล้วของปี พ.ศ. เดียวกัน ภายใต้ `SELECT … FOR UPDATE` (D11 default)
 * - `payee_profiles`/`users` ไม่มีคอลัมน์ที่อยู่ ⇒ ที่อยู่ผู้ถูกหักบนใบ 50 ทวิ พิมพ์เป็น "—"
 */

// ── สิทธิ์ (`25` §7.5 · `33` §12) ────────────────────────────────────────────

/** ออกหนังสือรับรอง / mark filed = บัญชี manage · การเงิน view (`25` §7.5) */
export const MANAGE_WHT = 'manage_wht'

/** ผู้ที่เปิดดูทะเบียนใบ 50 ทวิ/สรุปรอบนำส่งได้ (`33` §12 — การเงินอ่านอย่างเดียว) */
export const WHT_READ_CAPABILITIES = [MANAGE_WHT] as const

// ── ป้ายข้อความ ─────────────────────────────────────────────────────────────

export const WHT_CERTIFICATE_STATUS_LABEL: Record<WhtCertificateStatus, string> = {
  active: 'ใช้งาน',
  cancelled: 'ยกเลิก',
}

export const WHT_FILING_STATUS_LABEL: Record<WhtFilingStatus, string> = {
  pending: 'รอยื่นแบบ',
  filed: 'ยื่นแล้ว',
}

export const WHT_FILING_FORM_LABEL: Record<WhtFilingForm, string> = {
  PND3: 'ภ.ง.ด.3 (บุคคลธรรมดา)',
  PND53: 'ภ.ง.ด.53 (นิติบุคคล)',
}

export const WHT_DELIVERY_FORMAT_LABEL: Record<WhtDeliveryFormat, string> = {
  paper: 'กระดาษ (พิมพ์ส่งผู้ถูกหัก)',
  e_withholding: 'e-Withholding Tax (ส่งผ่านระบบอิเล็กทรอนิกส์)',
}

export const WHT_CERTIFICATE_TITLE = 'หนังสือรับรองการหักภาษี ณ ที่จ่าย'
export const WHT_CERTIFICATE_TITLE_EN = 'WITHHOLDING TAX CERTIFICATE'
/** ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร — พิมพ์ใต้ชื่อเอกสาร (`28` §6.3) */
export const WHT_CERTIFICATE_LEGAL_NOTE = 'ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร'

// ── เงื่อนไขการออกใบ (`33` §9) ──────────────────────────────────────────────

/**
 * รายการจ่ายนี้ต้องออกใบ 50 ทวิ หรือไม่ — **หักภาษีจริงเท่านั้น**
 *
 * `wht_satang = 0` เกิดได้ 2 กรณี: ยอดต่ำกว่าเกณฑ์ 1,000 บาท (`22` §6.9) และเงินทดรองจ่าย
 * ที่ไม่ใช่เงินได้ (A4) — ทั้งคู่ไม่มีภาษีถูกหักไว้จึงไม่มีสิ่งที่ต้องรับรอง
 */
export function shouldIssueCertificate(item: { whtSatang: number }): boolean {
  return item.whtSatang > 0
}

/** แบบที่ต้องยื่น — Tax Profile ที่ snapshot ไว้ชนะเสมอ (`18` §6.3) · ไม่มีก็เดาจากชนิดผู้รับเงิน */
export function filingFormOf(input: {
  taxProfileFilingForm: WhtFilingForm | null
  payeeType: PayeeType
}): WhtFilingForm {
  if (input.taxProfileFilingForm !== null) return input.taxProfileFilingForm
  return input.payeeType === 'corporate' ? 'PND53' : 'PND3'
}

/** ประเภทเงินได้พึงประเมิน (`28` §6.3 ฟิลด์บังคับ) — จาก Tax Profile ที่ snapshot ไว้ */
export const DEFAULT_INCOME_TYPE = 'ค่าจ้างทำของ มาตรา 40(8)'

export function incomeTypeOf(taxProfileIncomeType: string | null): string {
  const trimmed = (taxProfileIncomeType ?? '').trim()
  return trimmed === '' ? DEFAULT_INCOME_TYPE : trimmed
}

// ── เลขที่หนังสือรับรอง (D11 default — ตัวเดินเลขจริงล็อกแถวใน transaction) ──

/**
 * รูปแบบเลขที่ใบ 50 ทวิ — `WHT-2569-001` (ปี **พ.ศ.** ตาม mockup `accounting.html`)
 * รีเซ็ตรายปีตามปีที่จ่ายเงิน · ใช้ตัวประกอบเลขตัวเดียวกับใบกำกับภาษี (`13` §6.12) ห้ามเขียนใหม่
 */
export const WHT_CERTIFICATE_NUMBER_FORMAT: NumberingFormat = {
  mode: 'yearly_reset',
  prefix: 'WHT',
  digitLength: 3,
}

export function whtCertificateNumber(sequence: number, paymentDate: Date): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`whtCertificateNumber: ลำดับต้องเป็นจำนวนเต็มบวก (${sequence})`)
  }
  return formatInvoiceNumber(WHT_CERTIFICATE_NUMBER_FORMAT, sequence, paymentDate)
}

/** ส่วนนำหน้าของเลขที่ในปีเดียวกัน — ใช้กรองใบเก่าตอนหาลำดับถัดไป (`WHT-2569-`) */
export function whtCertificateNumberPrefix(paymentDate: Date): string {
  return `${whtCertificateNumber(1, paymentDate).slice(0, -WHT_CERTIFICATE_NUMBER_FORMAT.digitLength)}`
}

/** อ่านลำดับจากเลขที่ — รูปแบบที่ไม่ตรง (เลขเก่า/ปีอื่น) คืน `null` ให้ผู้เรียกข้ามไป */
export function parseCertificateSequence(certificateNumber: string, prefix: string): number | null {
  if (!certificateNumber.startsWith(prefix)) return null
  const tail = certificateNumber.slice(prefix.length)
  if (!/^\d+$/.test(tail)) return null
  return Number(tail)
}

/** ลำดับถัดไปจากใบที่ออกไปแล้วทั้งหมดของปีนั้น (รวมใบที่ยกเลิก — เลขไม่ recycle เหมือนใบกำกับภาษี) */
export function nextCertificateSequence(existingNumbers: readonly string[], prefix: string): number {
  let max = 0
  for (const number of existingNumbers) {
    const sequence = parseCertificateSequence(number, prefix)
    if (sequence !== null && sequence > max) max = sequence
  }
  return max + 1
}

// ── กำหนดเวลานำส่ง (`33` §6.2/§7.2) ─────────────────────────────────────────

/**
 * **วันที่ 15 ของเดือนถัดไป** — default ของ `33` §17 (ยื่นทางอินเทอร์เน็ต ไม่ใช่วันที่ 7 ของกระดาษ)
 * คืนเป็น date-only UTC เหมือนคอลัมน์ `DATE` (Rule 01 — วันตามปฏิทินไทย)
 */
export const FILING_DUE_DAY_OF_NEXT_MONTH = 15

export function filingDueDateOf(period: PeriodKey): Date {
  const next = nextPeriodKey(period)
  return new Date(Date.UTC(periodYearCe(next), next.month - 1, FILING_DUE_DAY_OF_NEXT_MONTH))
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** จำนวนวันคงเหลือก่อนถึงกำหนด (ติดลบ = เลยกำหนดแล้ว) — นับตามวันปฏิทิน**ไทย** ไม่ใช่ชั่วโมง */
export function daysUntilFilingDue(dueDate: Date, now: Date = new Date()): number {
  const today = toBangkokDateOnly(now).getTime()
  const due = toBangkokDateOnly(dueDate).getTime()
  return Math.round((due - today) / MS_PER_DAY)
}

/** เลยกำหนดแล้วแต่ยังไม่ยื่น (`33` §11) — `filed` แล้วไม่ถือว่าเลยกำหนดไม่ว่ากรณีใด */
export function isFilingOverdue(status: WhtFilingStatus, dueDate: Date, now: Date = new Date()): boolean {
  return status === 'pending' && daysUntilFilingDue(dueDate, now) < 0
}

export interface FilingWarning {
  code: 'FILING_OVERDUE_WARNING'
  title: string
  message: string
}

/**
 * คำเตือนกำหนดนำส่ง — **ไม่ block** (`24` §6.8 warn-only) · `null` = ยังไม่ต้องเตือน
 * (ยื่นแล้ว หรือยังไม่เลยกำหนด)
 */
export function filingOverdueWarning(
  summary: { periodLabel: string; status: WhtFilingStatus; filingDueDate: Date },
  now: Date = new Date(),
): FilingWarning | null {
  if (!isFilingOverdue(summary.status, summary.filingDueDate, now)) return null
  const overdueDays = Math.abs(daysUntilFilingDue(summary.filingDueDate, now))
  return {
    code: 'FILING_OVERDUE_WARNING',
    title: `เลยกำหนดนำส่ง ภ.ง.ด.3/53 ของรอบ ${summary.periodLabel} แล้ว`,
    message:
      `กำหนดนำส่งคือ ${fmtDate(summary.filingDueDate)} (เลยมา ${overdueDays} วัน) — ` +
      'ยื่นล่าช้ามีเบี้ยปรับ/เงินเพิ่มตามประมวลรัษฎากร ให้ประสานสำนักงานบัญชีทันที',
  }
}

// ── ยอดรวมของรอบนำส่ง (`33` §7.2 · §16) ─────────────────────────────────────

export interface FilingTotalSource {
  status: WhtCertificateStatus
  filingForm: WhtFilingForm
  whtSatang: number
  grossSatang: number
}

export interface FilingTotals {
  pnd3Satang: number
  pnd53Satang: number
  /** จำนวนใบที่นับยอด (ไม่รวมใบที่ยกเลิก) */
  activeCount: number
  cancelledCount: number
  grossSatang: number
}

/**
 * รวมยอด WHT ของรอบแยกตามแบบ — **ใบที่ `cancelled` ไม่ถูกนับ** (`33` §9/§16)
 * บ้านเดียวของกฎนี้: ทั้งคอลัมน์ในตาราง `wht_filing_summaries` และตัวเลขบนจอมาจากฟังก์ชันนี้
 */
export function summarizeFilingTotals(rows: readonly FilingTotalSource[]): FilingTotals {
  return rows.reduce<FilingTotals>(
    (totals, row) => {
      if (row.status === 'cancelled') return { ...totals, cancelledCount: totals.cancelledCount + 1 }
      return {
        pnd3Satang: totals.pnd3Satang + (row.filingForm === 'PND3' ? row.whtSatang : 0),
        pnd53Satang: totals.pnd53Satang + (row.filingForm === 'PND53' ? row.whtSatang : 0),
        activeCount: totals.activeCount + 1,
        cancelledCount: totals.cancelledCount,
        grossSatang: totals.grossSatang + row.grossSatang,
      }
    },
    { pnd3Satang: 0, pnd53Satang: 0, activeCount: 0, cancelledCount: 0, grossSatang: 0 },
  )
}

// ── State machine (`23` §6.11 · `33` §9/§10) ────────────────────────────────

/** `active → cancelled` เท่านั้น — `cancelled` เป็น terminal (ห้ามลบ ห้าม reverse) */
export function assertCertificateCancellable(status: WhtCertificateStatus): void {
  if (status === 'active') return
  throw new WhtError('WHT_CERTIFICATE_INVALID_STATUS', {
    detail: `cancel at ${status}`,
    context: { currentStatus: status },
  })
}

/** เหตุผลยกเลิกบังคับเสมอ (`33` §11) — คืนค่าที่ trim แล้วให้ผู้เรียกเก็บลง `cancel_reason` */
export function requireWhtCancelReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new WhtError('WHT_CANCEL_REQUIRES_REASON')
  return trimmed
}

/** `pending → filed` เท่านั้น — ยื่นแล้ว mark ซ้ำไม่ได้ (`33` §9 · `23` §6.11) */
export function assertFilingMarkable(status: WhtFilingStatus): void {
  if (status === 'pending') return
  throw new WhtError('WHT_FILING_ALREADY_FILED', { context: { currentStatus: status } })
}

// ── แบบข้อมูลของเอกสาร PDF (`28` §6.3) ──────────────────────────────────────

export interface WhtCertificateParty {
  name: string
  taxId: string
  address: string
  phone: string | null
}

export interface WhtCertificateDocSource {
  certificateNumber: string
  status: WhtCertificateStatus
  cancelReason: string | null
  cancelledAt: Date | null
  replacesCertificateNumber: string | null
  deliveryFormat: WhtDeliveryFormat
  filingForm: WhtFilingForm
  incomeType: string
  paymentDate: Date
  grossSatang: number
  whtSatang: number
  /** ผู้จ่ายเงิน = องค์กรเจ้าของระบบ (`28` §6.3) */
  payer: WhtCertificateParty
  /** ผู้ถูกหักภาษี = payee (`18`) */
  payee: WhtCertificateParty
}

/** เอกสารที่ประกอบเป็นข้อความครบแล้ว — component PDF ห้าม format/คำนวณซ้ำ (Rule 01) */
export interface WhtCertificateDoc {
  title: string
  titleEn: string
  legalNote: string
  certificateNumber: string
  statusLabel: string
  isCancelled: boolean
  cancelNote: string | null
  replacesNote: string | null
  deliveryFormatLabel: string
  filingFormLabel: string
  filingForm: WhtFilingForm
  incomeType: string
  paymentDateLabel: string
  payer: WhtCertificateParty
  payee: WhtCertificateParty
  grossText: string
  whtText: string
  whtInWordsText: string
  netText: string
  fileName: string
}

/** ค่าที่ไม่มีในสคีมา (ที่อยู่ผู้ถูกหัก — D15) พิมพ์เป็นขีดกลาง ห้ามเว้นว่างบนเอกสารทางการ */
export const EMPTY_FIELD_TEXT = '—'

export function buildWhtCertificateDoc(source: WhtCertificateDocSource): WhtCertificateDoc {
  const isCancelled = source.status === 'cancelled'

  return {
    title: WHT_CERTIFICATE_TITLE,
    titleEn: WHT_CERTIFICATE_TITLE_EN,
    legalNote: WHT_CERTIFICATE_LEGAL_NOTE,
    certificateNumber: source.certificateNumber,
    statusLabel: WHT_CERTIFICATE_STATUS_LABEL[source.status],
    isCancelled,
    cancelNote: isCancelled
      ? `ยกเลิกเมื่อ ${fmtDate(source.cancelledAt)} — ${(source.cancelReason ?? '').trim() || 'ไม่ระบุเหตุผล'}`
      : null,
    replacesNote:
      source.replacesCertificateNumber === null
        ? null
        : `ออกแทนหนังสือรับรองเลขที่ ${source.replacesCertificateNumber} ที่ถูกยกเลิก`,
    deliveryFormatLabel: WHT_DELIVERY_FORMAT_LABEL[source.deliveryFormat],
    filingFormLabel: WHT_FILING_FORM_LABEL[source.filingForm],
    filingForm: source.filingForm,
    incomeType: source.incomeType,
    paymentDateLabel: fmtDate(source.paymentDate),
    payer: source.payer,
    payee: source.payee,
    grossText: fmtSatang(source.grossSatang),
    whtText: fmtSatang(source.whtSatang),
    whtInWordsText: bahtInWords(source.whtSatang),
    netText: fmtSatang(source.grossSatang - source.whtSatang),
    fileName: `${source.certificateNumber}.pdf`,
  }
}
