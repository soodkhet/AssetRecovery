import { assertOrgWideReadable } from '@/lib/auth/scope'
import { payeeAddressLine, payeeDisplayName, payeeLegalName } from '@/lib/payees/payee'
import type { AccountingMutationContext } from '@/lib/accounting/queries'
import { isPeriodEnded, PERIOD_ASSUMED_OPEN, periodCloseAvailableFrom, type PeriodClosedLookup } from '@/lib/accounting/period'
import { AccountingError } from '@/lib/accounting/errors'
import { fmtDate } from '@/lib/format/datetime'
import { assertPeriodOpenAt, loadPeriodClosedLookup } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { nextDocumentNumber } from '@/lib/document-numbering/queries'
import { toBangkokDateOnly } from '@/lib/revenue/revenue'
import { loadHolidayKeys } from '@/lib/settings/queries/holiday-keys'
import { resolveWhtFilingMethod } from '@/lib/settings/queries/wht-policy'
import { WHT_FILING_METHOD_SUFFIX } from '@/lib/settings/wht-policy'
import { WhtError } from '@/lib/wht/errors'
import { usersWithCapability } from '@/lib/notifications/dispatch'
import { whtSupplementaryFilingMessage } from '@/lib/notifications/messages'
import { enqueueNotificationOutbox } from '@/lib/notifications/outbox'
import { outboxMessageEntries } from '@/lib/notifications/outbox-core'
import type {
  WhtCancelInput,
  WhtCertificateListQuery,
  WhtFilingSummaryListQuery,
  WhtMarkFiledInput,
  WhtMarkSupplementaryFiledInput,
} from '@/lib/wht/schemas'
import type {
  WhtCertificateDto,
  WhtCertificateListDto,
  WhtFilingSummaryDto,
  WhtFilingSummaryListDto,
} from '@/lib/wht/types'
import {
  assertCertificateCancellable,
  assertFilingMarkable,
  assertSupplementaryFilingMarkable,
  type FilingAmounts,
  MANAGE_WHT,
  supplementaryFilingDiff,
  daysUntilFilingDue,
  EMPTY_FIELD_TEXT,
  filingDueDateOf,
  filingDueDateText,
  filingDueLabel,
  filingMethodResolveDate,
  filingNominalDueDateOf,
  filingFormOf,
  filingOverdueWarning,
  filingSequenceNumber,
  groupCertificateSources,
  type CertificateGroupingOptions,
  incomeTypeOf,
  isFilingOverdue,
  requireWhtCancelReason,
  summarizeFilingTotals,
  WHT_CERTIFICATE_STATUS_LABEL,
  WHT_DELIVERY_FORMAT_LABEL,
  WHT_FILING_FORM_LABEL,
  WHT_FILING_STATUS_LABEL,
  type CertificateGroup,
  type WhtCertificateDocSource,
  whtPartyBranchLabel,
} from '@/lib/wht/wht'
import type { WhtCertificateMode, WhtIncomeCategory } from '@/lib/settings/wht-policy'

/**
 * WHT Data (ไฟล์ 33) — ชั้น DB (`33` §14)
 *
 * ### กติกาที่ห้ามหลุด
 * - **ใบเกิดจากรอบจ่ายที่ `completed` เท่านั้น** ผ่าน `syncWhtCertificatesFromPayout()` ซึ่งถูกเรียก
 *   ต่อท้าย `syncExpenseRecordsFromPayout()` (ไฟล์ 32) — เพราะใบผูกกับ `expense_record_id`
 *   · **idempotent**: 1 รายการจ่าย = 1 ใบที่ `active` เรียกซ้ำไม่สร้างซ้ำ
 * - **เลขที่เดินภายใต้ล็อกในทรานแซกชันเดียวกับ insert** (D11 default) — ยังไม่มีคอลัมน์
 *   `wht_certificate_seq` ใน `02` ⇒ ลำดับ derive จากเลขที่ของปีเดียวกัน (รวมใบที่ยกเลิกด้วย —
 *   เลขไม่ recycle เหมือนใบกำกับภาษี `31` §9.1) ภายใต้ `pg_advisory_xact_lock` ค่าคงที่
 *   เพราะคอลัมน์เลขที่เป็น **UNIQUE ทั้งตาราง** (`02` §9) ไม่ใช่ unique ต่อองค์กร
 * - **ยกเลิกแล้วห้ามลบ/ห้าม reverse** (`02` §13) — ยอดใบที่ยกเลิกหายจาก `pnd3/pnd53` ทันที
 *   เพราะสรุปรอบถูก**คำนวณใหม่ทุกครั้ง**ที่ใบเกิด/ถูกยกเลิก ด้วย `summarizeFilingTotals()`
 * - `mark-filed` **ไม่ติดยาม Period Lock** โดยเจตนา — กำหนดยื่นคือวันที่ 7 (กระดาษ) หรือ 15 (ออนไลน์) ของเดือนถัดไป ซึ่งงวด
 *   นั้นมักถูกล็อกไปแล้ว (`13` §6.11 คุมการแก้ "ข้อมูลของงวด" ไม่ใช่การบันทึกว่ายื่นแบบเสร็จ)
 *   · การ**ยกเลิก**ใบยังติดยามตามปกติ เพราะกระทบยอดภาษีของงวด (แนวเดียวกับใบกำกับภาษี 4.3)
 */

const CERT_TARGET = 'wht_certificates'
const FILING_TARGET = 'wht_filing_summaries'
/** แหล่งของแถวคิวแจ้งเตือน "ต้องยื่นเพิ่มเติม" (มติ PO U127) — ส่งโดยรอบ cron `drainNotificationOutbox()` */
const SUPPLEMENTARY_OUTBOX_SOURCE = 'wht_supplementary_filing'

// ── select / mapper ─────────────────────────────────────────────────────────

const CERT_SELECT = {
  id: true,
  certificateNumber: true,
  payeeId: true,
  expenseRecordId: true,
  incomeType: true,
  paymentDate: true,
  grossSatang: true,
  whtSatang: true,
  filingForm: true,
  deliveryFormat: true,
  status: true,
  cancelReason: true,
  cancelledAt: true,
  replacesCertificateId: true,
  issueMode: true,
  payoutBatchId: true,
  createdAt: true,
  // snapshot ผู้ถูกหัก/ผู้หัก ณ วันออกใบ (มติ PO U96 #4) — เอกสาร/ทะเบียนอ่านจากตรงนี้ ไม่อ่านโปรไฟล์ปัจจุบัน
  payeeName: true,
  payeeNameTitle: true,
  payeeType: true,
  payeeTaxId: true,
  payeeAddress: true,
  payeeBranchCode: true,
  whtCondition: true,
  payerName: true,
  payerTaxId: true,
  payerAddress: true,
  payerBranchCode: true,
  payerSignerName: true,
  payerSignerTitle: true,
  cancelledByUser: { select: { fullName: true } },
  replaces: { select: { certificateNumber: true } },
  expenseRecord: {
    select: {
      periodId: true,
      period: { select: { periodLabel: true, yearBe: true, month: true } },
      payoutBatchItem: {
        select: { payoutBatchId: true, whtIncomeCategory: true, payoutBatch: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.WhtCertificateSelect

type CertRow = Prisma.WhtCertificateGetPayload<{ select: typeof CERT_SELECT }>

function toCertDto(row: CertRow, periodClosed: PeriodClosedLookup = PERIOD_ASSUMED_OPEN): WhtCertificateDto {
  return {
    id: row.id,
    certificateNumber: row.certificateNumber,
    payeeId: row.payeeId,
    payeeName: payeeDisplayName({ name: row.payeeName, nameTitle: row.payeeNameTitle, payeeType: row.payeeType }),
    payeeTaxId: row.payeeTaxId,
    incomeType: row.incomeType,
    paymentDate: row.paymentDate.toISOString(),
    grossSatang: row.grossSatang,
    whtSatang: row.whtSatang,
    filingForm: row.filingForm,
    filingFormLabel: WHT_FILING_FORM_LABEL[row.filingForm],
    deliveryFormat: row.deliveryFormat,
    deliveryFormatLabel: WHT_DELIVERY_FORMAT_LABEL[row.deliveryFormat],
    status: row.status,
    statusLabel: WHT_CERTIFICATE_STATUS_LABEL[row.status],
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
    cancelledByName: row.cancelledByUser?.fullName ?? null,
    replacesCertificateId: row.replacesCertificateId,
    replacesCertificateNumber: row.replaces?.certificateNumber ?? null,
    expenseRecordId: row.expenseRecordId,
    issueMode: row.issueMode,
    payoutBatchId: row.expenseRecord.payoutBatchItem.payoutBatchId,
    payoutBatchName: row.expenseRecord.payoutBatchItem.payoutBatch.name,
    periodId: row.expenseRecord.periodId,
    periodLabel: row.expenseRecord.period.periodLabel,
    createdAt: row.createdAt.toISOString(),
    // ยามยกเลิกใช้งวดของ `payment_date` — ตัวเดียวกับที่นี่ (UAT BUG-169)
    periodClosed: periodClosed(row.paymentDate),
  }
}

const FILING_SELECT = {
  id: true,
  periodId: true,
  periodLabel: true,
  filingDueDate: true,
  pnd3Satang: true,
  pnd53Satang: true,
  pnd1Satang: true,
  filingMethod: true,
  status: true,
  filedAt: true,
  filedByUser: { select: { fullName: true } },
  period: { select: { yearBe: true, month: true } },
  supplementaryRequiredAt: true,
  supplementaryFiledAt: true,
  supplementaryFiledByUser: { select: { fullName: true } },
} satisfies Prisma.WhtFilingSummarySelect

type FilingRow = Prisma.WhtFilingSummaryGetPayload<{ select: typeof FILING_SELECT }>

/**
 * @param current ยอดปัจจุบันจากใบที่มีผล — ส่งเฉพาะรอบที่ติดธงต้องยื่นเพิ่มเติม (U127) เพื่อคิดยอดต่าง
 */
function toFilingDto(row: FilingRow, now: Date, current: FilingAmounts | null = null): WhtFilingSummaryDto {
  // วันตามปฏิทินก่อนเลื่อนวันหยุด (U93) — คิดจากงวด + วิธียื่นที่ snapshot ไว้ (ไม่ต้องเก็บคอลัมน์เพิ่ม)
  const nominal = filingNominalDueDateOf({ yearBe: row.period.yearBe, month: row.period.month }, row.filingMethod)
  const shifted = nominal.getTime() !== row.filingDueDate.getTime()
  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.periodLabel,
    filingDueDate: row.filingDueDate.toISOString(),
    filingNominalDueDate: shifted ? nominal.toISOString() : null,
    filingDueLabel: filingDueLabel(row.filingDueDate, row.filingMethod, nominal),
    filingDueDateText: filingDueDateText(row.filingDueDate, nominal),
    filingMethod: row.filingMethod,
    filingMethodLabel: WHT_FILING_METHOD_SUFFIX[row.filingMethod],
    pnd3Satang: row.pnd3Satang,
    pnd53Satang: row.pnd53Satang,
    pnd1Satang: row.pnd1Satang,
    status: row.status,
    statusLabel: WHT_FILING_STATUS_LABEL[row.status],
    filedAt: row.filedAt === null ? null : row.filedAt.toISOString(),
    filedByName: row.filedByUser?.fullName ?? null,
    daysRemaining: daysUntilFilingDue(row.filingDueDate, now),
    isOverdue: isFilingOverdue(row.status, row.filingDueDate, now),
    supplementaryRequired: row.supplementaryRequiredAt !== null,
    supplementaryRequiredAt: row.supplementaryRequiredAt?.toISOString() ?? null,
    supplementaryDiff:
      row.supplementaryRequiredAt === null || current === null ? null : supplementaryFilingDiff(row, current),
    supplementaryFiledAt: row.supplementaryFiledAt?.toISOString() ?? null,
    supplementaryFiledByName: row.supplementaryFiledByUser?.fullName ?? null,
    markFiledAvailableFrom: periodCloseAvailableFrom({ yearBe: row.period.yearBe, month: row.period.month }).toISOString(),
    canMarkFiledNow: isPeriodEnded({ yearBe: row.period.yearBe, month: row.period.month }, now),
  }
}

/** ยอด ภ.ง.ด. ปัจจุบันจากใบที่ยังมีผลของงวด (สูตรเดียวกับสรุปรอบ — `summarizeFilingTotals()`) */
async function currentFilingAmounts(client: TxClient, organizationId: string, periodId: string): Promise<FilingAmounts> {
  const certificates = await client.whtCertificate.findMany({
    where: { organizationId, expenseRecord: { periodId } },
    select: { status: true, filingForm: true, whtSatang: true, grossSatang: true },
  })
  const totals = summarizeFilingTotals(certificates)
  return { pnd1Satang: totals.pnd1Satang, pnd3Satang: totals.pnd3Satang, pnd53Satang: totals.pnd53Satang }
}

// ── สรุปรอบนำส่ง: สร้าง/คำนวณใหม่ (`33` §7.2) ───────────────────────────────

/** ชนิด tx ของ client ที่ต่อ extension แล้ว (กับดัก `Prisma.TransactionClient` — REUSE_INDEX 14/08) */
type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

/**
 * คำนวณ `pnd3/pnd53` ของงวดใหม่ทั้งก้อนจากใบที่ `active` แล้วเขียนทับ — **idempotent**
 * เรียกทุกครั้งที่ใบเกิดหรือถูกยกเลิก (`33` §9 — ใบที่ยกเลิกต้องหายจากยอดทันที)
 */
export async function refreshFilingSummary(
  tx: TxClient,
  input: {
    organizationId: string
    periodId: string
    periodLabel: string
    yearBe: number
    month: number
  },
  options: {
    /**
     * มติ PO U127 — การยกเลิก/ออกใบที่เป็นต้นเหตุของการคำนวณครั้งนี้ · รอบที่ยื่นแล้ว ⇒ ติดธงต้องยื่นเพิ่มเติม
     * + เข้าคิวแจ้งบัญชีในทรานแซกชันเดียวกัน · ไม่ส่ง (job รายวัน) = ไม่ติดธง
     */
    certificateEvent?: { at: Date; certificateNumber: string; action: 'cancelled' | 'issued' }
  } = {},
): Promise<FilingRow> {
  const certificates = await tx.whtCertificate.findMany({
    where: { organizationId: input.organizationId, expenseRecord: { periodId: input.periodId } },
    select: { status: true, filingForm: true, whtSatang: true, grossSatang: true },
  })
  const totals = summarizeFilingTotals(certificates)
  // มติ PO U45 — วันกำหนดยื่นตามวิธียื่นที่ตั้งไว้ (ค่าตั้งที่มีผล ณ วันที่ 1 ของเดือนที่ยื่น)
  const period = { yearBe: input.yearBe, month: input.month }
  const filingMethod = await resolveWhtFilingMethod(tx, input.organizationId, filingMethodResolveDate(period))
  // มติ PO U93 — ตรงเสาร์/อาทิตย์/วันหยุดในปฏิทินองค์กร ⇒ เลื่อนเป็นวันทำการถัดไป
  const filingDueDate = filingDueDateOf(period, filingMethod, await loadHolidayKeys(tx, input.organizationId))

  const existing = await tx.whtFilingSummary.findUnique({
    where: { periodId: input.periodId },
    select: { id: true, status: true },
  })
  // `33` §7.2 — รอบที่บัญชี mark `filed` แล้ว (ยื่นจริงนอกระบบ) ห้ามคิดทับ: ทั้งยอด ภ.ง.ด. วันกำหนดยื่น และวิธียื่น
  // คือบันทึกสิ่งที่ยื่นไปแล้ว (Final Test ด่าน 3) · มติ PO U127: การยกเลิก/ออกใบหลังยื่น = ติดธง "ต้องยื่นเพิ่มเติม"
  // (ยอดต่างคิดสดจากใบที่มีผล) + แจ้งบัญชี — ยอดที่ยื่นไม่ถูกเขียนทับ
  if (existing?.status === 'filed') {
    const event = options.certificateEvent
    if (event === undefined) {
      return tx.whtFilingSummary.findUniqueOrThrow({ where: { id: existing.id }, select: FILING_SELECT })
    }
    const flagged = await tx.whtFilingSummary.update({
      where: { id: existing.id },
      data: { supplementaryRequiredAt: event.at },
      select: FILING_SELECT,
    })
    const recipients = await usersWithCapability(input.organizationId, MANAGE_WHT)
    await enqueueNotificationOutbox(
      tx,
      outboxMessageEntries(
        input.organizationId,
        recipients,
        whtSupplementaryFilingMessage({
          summaryId: existing.id,
          periodLabel: input.periodLabel,
          certificateNumber: event.certificateNumber,
          action: event.action,
        }),
      ),
      { jobType: SUPPLEMENTARY_OUTBOX_SOURCE },
    )
    return flagged
  }

  if (existing === null) {
    return tx.whtFilingSummary.create({
      data: {
        organizationId: input.organizationId,
        periodId: input.periodId,
        periodLabel: input.periodLabel,
        filingDueDate,
        filingMethod,
        pnd3Satang: totals.pnd3Satang,
        pnd53Satang: totals.pnd53Satang,
        pnd1Satang: totals.pnd1Satang,
      },
      select: FILING_SELECT,
    })
  }

  return tx.whtFilingSummary.update({
    where: { id: existing.id },
    data: {
      pnd3Satang: totals.pnd3Satang,
      pnd53Satang: totals.pnd53Satang,
      pnd1Satang: totals.pnd1Satang,
      filingDueDate,
      filingMethod,
    },
    select: FILING_SELECT,
  })
}

// ── จุดเสียบ: รอบจ่ายเงิน `completed` ⇒ ออกใบ 50 ทวิ (`33` §9) ──────────────

/**
 * เลขที่ใบ 50 ทวิ ถัดไป — ชุดเลขกลาง `wht_certificate` ต่อองค์กร (มติ PO U102) · ปีตามวันที่จ่ายเงิน (เวลาไทย)
 * ล็อกแถวชุดเลข FOR UPDATE ภายในทรานแซกชันเดียวกับการออกใบ ⇒ คำขอพร้อมกันต่อคิว · ล้ม = เลขไม่ขาด
 */
async function reserveCertificateNumber(tx: TxClient, organizationId: string, paymentDate: Date): Promise<string> {
  return (await nextDocumentNumber(tx, organizationId, 'wht_certificate', paymentDate)).number
}

const EXPENSE_SOURCE_SELECT = {
  id: true,
  periodId: true,
  grossSatang: true,
  whtSatang: true,
  period: { select: { periodLabel: true, yearBe: true, month: true } },
  payoutBatchItem: {
    select: {
      payoutBatchId: true,
      payeeId: true,
      whtBaseIncluded: true,
      whtIncomeCategory: true,
      // มติ PO U105 — เงื่อนไขการหักที่ snapshot ตอนสร้างรอบ (ตัวที่ใช้คิดยอดจริง) — ไม่ใช่ค่าปัจจุบันของผู้รับ
      whtCondition: true,
      payoutBatch: {
        select: {
          name: true,
          status: true,
          paymentFileGeneratedAt: true,
          updatedAt: true,
          whtCertificateMode: true,
          whtIssueZeroRate402Certificate: true,
        },
      },
      payee: {
        select: {
          id: true,
          payeeType: true,
          // staging E-002/E-010 — นิติบุคคลพิมพ์ชื่อตามหนังสือรับรอง
          legalName: true,
          nationalId: true,
          nameTitle: true,
          addressDetail: true,
          addressSubdistrict: true,
          addressDistrict: true,
          addressProvince: true,
          addressPostalCode: true,
          branchCode: true,
          whtCondition: true,
          user: { select: { fullName: true } },
        },
      },
      taxProfile: { select: { filingForm: true, incomeType: true } },
    },
  },
} satisfies Prisma.ExpenseRecordSelect

type ExpenseSourceRow = Prisma.ExpenseRecordGetPayload<{ select: typeof EXPENSE_SOURCE_SELECT }>

/** แถวต้นทางพร้อมฟิลด์ที่ `groupCertificateSources()` ใช้ */
type SourceItem = ExpenseSourceRow & {
  payeeId: string
  whtBaseIncluded: boolean
  incomeCategory: WhtIncomeCategory | null
}
type SourceGroup = CertificateGroup<SourceItem>

function toSourceItem(row: ExpenseSourceRow): SourceItem {
  return {
    ...row,
    payeeId: row.payoutBatchItem.payeeId,
    whtBaseIncluded: row.payoutBatchItem.whtBaseIncluded,
    incomeCategory: row.payoutBatchItem.whtIncomeCategory,
  }
}

/** รูปแบบการออกใบของรอบ — snapshot NULL = รอบที่สร้างก่อนมีค่าตั้ง ⇒ ต่อรายการ (พฤติกรรมเดิม) */
function batchCertificateMode(row: ExpenseSourceRow): WhtCertificateMode {
  return row.payoutBatchItem.payoutBatch.whtCertificateMode ?? 'per_item'
}

/**
 * ค่าตั้ง "40(2) อัตรา 0% ออก 50 ทวิ" ที่ snapshot ไว้กับรอบ (มติ PO 05/10/2569 UAT U16)
 * NULL = รอบที่สร้างก่อนมีค่าตั้ง ⇒ ไม่ออก (พฤติกรรมเดิม) — ไม่ดูค่าตั้งปัจจุบัน (Rule 08)
 */
function batchGroupingOptions(row: ExpenseSourceRow): CertificateGroupingOptions {
  return { issueZeroRate402Certificate: row.payoutBatchItem.payoutBatch.whtIssueZeroRate402Certificate ?? false }
}

/** รายการค่าใช้จ่ายของรอบจ่าย (ทั้งรอบ หรือเฉพาะผู้รับหนึ่งคน) เรียงตามเวลาสร้าง — ลำดับนี้กำหนด "จุดยึด" ของใบ */
async function loadBatchSources(
  organizationId: string,
  payoutBatchId: string,
  payeeId?: string,
): Promise<SourceItem[]> {
  const rows = await prisma.expenseRecord.findMany({
    where: {
      organizationId,
      payoutBatchItem: { payoutBatchId, ...(payeeId === undefined ? {} : { payeeId }) },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: EXPENSE_SOURCE_SELECT,
  })
  return rows.map(toSourceItem)
}

/** วันที่จ่ายจริง (`32` §7.1 — ใช้นิยามเดียวกับบัญชีค่าใช้จ่าย) แปลงเป็นวันตามปฏิทินไทย */
function paymentDateOf(row: ExpenseSourceRow): Date {
  const batch = row.payoutBatchItem.payoutBatch
  return toBangkokDateOnly(batch.paymentFileGeneratedAt ?? batch.updatedAt)
}

/**
 * ออกใบ 50 ทวิ 1 ใบจากกลุ่มรายการ (ต่อรายการ หรือต่อผู้รับต่อรอบ — `groupCertificateSources()`)
 * เรียกภายในทรานแซกชันเท่านั้น · `replacesId` = ฉบับที่ถูกยกเลิกและใบนี้ออกแทน (`33` §9)
 */
async function issueCertificate(
  tx: TxClient,
  ctx: AccountingMutationContext,
  group: SourceGroup,
  replacesId: string | null,
  traceNote = '',
): Promise<CertRow> {
  const organizationId = ctx.actor.organizationId
  const source = group.anchor
  const item = source.payoutBatchItem
  const paymentDate = paymentDateOf(source)
  const certificateNumber = await reserveCertificateNumber(tx, organizationId, paymentDate)
  const incomeCategory = item.whtIncomeCategory
  const filingForm = filingFormOf({
    taxProfileFilingForm: item.taxProfile?.filingForm ?? null,
    payeeType: item.payee.payeeType,
    incomeCategory,
  })
  const perBatch = group.mode === 'per_payee_batch'
  const payee = item.payee
  // มติ PO U105 — ช่อง "ผู้จ่ายเงิน" ต้องตรงกับวิธีคิดยอดจริงของรอบ ⇒ ใช้ snapshot ของรายการ (NULL = รอบเก่า = (1))
  // เงินได้บนใบ (gross) ของ (2)/(3) รวมภาษีที่ออกให้อยู่แล้วตั้งแต่สร้างรอบ (`payout_batch_items.gross_satang`)
  const whtCondition = item.whtCondition ?? 'withhold'
  // ผู้หัก = องค์กร ณ วันออกใบ (snapshot — มติ PO U96 #4)
  const payer = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      name: true,
      taxId: true,
      address: true,
      branchCode: true,
      authorizedSignerName: true,
      authorizedSignerTitle: true,
    },
  })

  const created = await tx.whtCertificate.create({
    data: {
      organizationId,
      certificateNumber,
      payeeId: payee.id,
      expenseRecordId: source.id,
      incomeType: incomeTypeOf(item.taxProfile?.incomeType ?? null, incomeCategory, payee.payeeType),
      // snapshot ผู้ถูกหักจากโปรไฟล์ ณ วันออกใบ — แก้โปรไฟล์ภายหลังไม่กระทบใบนี้ (immutable ที่ DB)
      payeeName: payeeLegalName({ payeeType: payee.payeeType, legalName: payee.legalName, userFullName: payee.user.fullName }),
      payeeNameTitle: payee.payeeType === 'corporate' ? null : payee.nameTitle,
      payeeType: payee.payeeType,
      payeeTaxId: payee.nationalId,
      payeeAddress: payeeAddressLine(payee),
      payeeBranchCode: payee.payeeType === 'corporate' ? payee.branchCode : null,
      whtCondition,
      payerName: payer.name,
      payerTaxId: payer.taxId,
      payerAddress: payer.address,
      payerBranchCode: payer.branchCode,
      // มติ PO U151 — ผู้ลงนามฝั่งผู้จ่ายเงิน ณ วันออกใบ (ช่อง "ลงชื่อ … ผู้จ่ายเงิน" ตามแบบทางการ)
      payerSignerName: payer.authorizedSignerName,
      payerSignerTitle: payer.authorizedSignerTitle,
      paymentDate,
      grossSatang: group.grossSatang,
      whtSatang: group.whtSatang,
      filingForm,
      issueMode: group.mode,
      payoutBatchId: perBatch ? item.payoutBatchId : null,
      replacesCertificateId: replacesId,
      createdBy: ctx.actor.id,
    },
    select: CERT_SELECT,
  })

  await emitAudit(
    {
      organizationId,
      actorId: ctx.actor.id,
      actorRole: ctx.actor.roleName,
      action: 'create',
      targetType: CERT_TARGET,
      targetId: created.id,
      after: {
        certificate_number: certificateNumber,
        payee_name: payeeLegalName({
          payeeType: item.payee.payeeType,
          legalName: item.payee.legalName,
          userFullName: item.payee.user.fullName,
        }),
        payee_tax_id: payee.nationalId,
        payee_address: payeeAddressLine(payee),
        payee_branch_code: payee.payeeType === 'corporate' ? payee.branchCode : null,
        wht_condition: whtCondition,
        expense_record_id: source.id,
        payout_batch_id: item.payoutBatchId,
        issue_mode: group.mode,
        expense_record_ids: group.members.map((member) => member.id),
        payment_date: paymentDate.toISOString(),
        gross_satang: group.grossSatang,
        wht_satang: group.whtSatang,
        filing_form: filingForm,
        replaces_certificate_id: replacesId,
      },
      reason:
        replacesId === null
          ? `ออกหนังสือรับรองหัก ณ ที่จ่าย ${certificateNumber} อัตโนมัติจากรอบจ่าย "${item.payoutBatch.name}" ที่จ่ายเงินจริงแล้ว${traceNote}`
          : `ออกหนังสือรับรอง ${certificateNumber} แทนฉบับที่ถูกยกเลิก${traceNote}`,
      ipAddress: ctx.meta.ipAddress,
      userAgent: ctx.meta.userAgent,
    },
    tx,
  )

  await refreshFilingSummary(
    tx,
    {
      organizationId,
      periodId: source.periodId,
      periodLabel: source.period.periodLabel,
      yearBe: source.period.yearBe,
      month: source.period.month,
    },
    { certificateEvent: { at: created.createdAt, certificateNumber, action: 'issued' } },
  )

  return created
}

/**
 * **จุดเสียบของไฟล์ 32** — รอบจ่ายที่ `completed` มีบัญชีค่าใช้จ่ายแล้ว ⇒ ออกใบ 50 ทวิ ให้ทุกรายการ
 * ที่มีการหักภาษีจริง (`33` §9) — idempotent เรียกซ้ำไม่สร้างซ้ำ (1 รายการ = 1 ใบที่ `active`)
 */
export interface PayoutSyncOptions {
  /**
   * มติ PO U134 — ตัวกวาดทำต่อขั้นหลังรอบจ่าย `completed` ⇒ ออกเฉพาะใบที่**ยังไม่เคยออกเลย**
   * (จุดยึดที่มีใบที่ยกเลิกแล้ว = คนตั้งใจยกเลิก ⇒ ไม่ออกใบแทนให้เอง)
   */
  missingOnly?: boolean
  /** ต่อท้ายเหตุผล audit — ตามรอยกลับงานเบื้องหลังที่ทำต่อ (เช่น ` (ทำต่อโดยงานเบื้องหลัง job id …)`) */
  traceNote?: string
}

export async function syncWhtCertificatesFromPayout(
  ctx: AccountingMutationContext,
  payoutBatchId: string,
  options: PayoutSyncOptions = {},
): Promise<WhtCertificateDto[]> {
  const organizationId = ctx.actor.organizationId
  const records = await loadBatchSources(organizationId, payoutBatchId)
  if (records.length === 0) return []
  // รูปแบบการออกเป็น snapshot ของรอบ (มติ PO 05/10/2569 UAT U4) — ไม่ใช่ค่าตั้งปัจจุบัน
  const groups = groupCertificateSources(records, batchCertificateMode(records[0]!), batchGroupingOptions(records[0]!))

  const issued: CertRow[] = []
  for (const group of groups) {
    // ใบผูกกับ "จุดยึด" ของกลุ่ม (รายการแรกของผู้รับในรอบ / ตัวรายการเอง) ⇒ partial unique เดิมกันออกซ้ำได้ทั้งสองแบบ
    const record = group.anchor
    const existing = await prisma.whtCertificate.findFirst({
      where: { organizationId, expenseRecordId: record.id },
      orderBy: { createdAt: 'desc' },
      select: CERT_SELECT,
    })
    // มีใบที่ยังใช้งานอยู่แล้ว = ไม่ต้องออกใหม่ · มีแต่ใบที่ยกเลิก = ออกใบแทนพร้อมอ้างกลับ (`33` §10)
    if (existing !== null && existing.status === 'active') {
      issued.push(existing)
      continue
    }
    if (existing !== null && options.missingOnly === true) continue

    try {
      issued.push(
        await prisma.$transaction((tx) => issueCertificate(tx, ctx, group, existing?.id ?? null, options.traceNote ?? '')),
      )
    } catch (error) {
      // แข่งกันออกใบพร้อมกัน (รอบจ่ายเป็น `completed` ได้ 2 ทาง — ยืนยันด้วยมือกับกระทบยอดธนาคาร)
      // ⇒ คนที่แพ้ `uniq_wht_cert_active_per_expense` อ่านใบที่มีอยู่แล้วกลับไป ไม่ใช่ error
      // (แนวเดียวกับ `syncExpenseRecordsFromPayout()` ที่แพ้ unique ของ `payout_batch_item_id`)
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      const raced = await prisma.whtCertificate.findFirst({
        where: { organizationId, expenseRecordId: record.id, status: 'active' },
        select: CERT_SELECT,
      })
      if (raced === null) throw error
      issued.push(raced)
    }
  }

  return issued.map((row) => toCertDto(row))
}

// ── GET /api/accounting/wht-certificates (`33` §14) ─────────────────────────

export async function listWhtCertificates(
  user: SessionUser,
  query: WhtCertificateListQuery,
): Promise<WhtCertificateListDto> {
  assertOrgWideReadable(user, 'wht-certificates')
  const rows = await prisma.whtCertificate.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.filingForm === undefined ? {} : { filingForm: query.filingForm }),
      // E-052 — `payoutBatchId` = ใบของรอบจ่ายเดียว (ปุ่ม "50 ทวิ" ในหน้ารอบจ่าย)
      ...(query.periodId === undefined && query.payoutBatchId === undefined
        ? {}
        : {
            expenseRecord: {
              ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
              ...(query.payoutBatchId === undefined ? {} : { payoutBatchItem: { payoutBatchId: query.payoutBatchId } }),
            },
          }),
    },
    orderBy: [{ paymentDate: 'desc' }, { certificateNumber: 'desc' }],
    select: CERT_SELECT,
  })

  const periodClosed = await loadPeriodClosedLookup(user.organizationId)
  return { items: rows.map((row) => toCertDto(row, periodClosed)), summary: summarizeFilingTotals(rows) }
}

async function findCertificate(user: SessionUser, certificateId: string): Promise<CertRow> {
  assertOrgWideReadable(user, 'wht-certificates')
  const row = await prisma.whtCertificate.findFirst({
    where: { id: certificateId, organizationId: user.organizationId },
    select: CERT_SELECT,
  })
  if (row === null) {
    throw new WhtError('WHT_CERTIFICATE_NOT_FOUND', { detail: `wht_certificate=${certificateId}` })
  }
  return row
}

// ── PATCH /api/accounting/wht-certificates/:id/cancel (`33` §14) ────────────

/**
 * `active → cancelled` — **ไม่ใช่การลบ**: แถวเดิมอยู่ครบพร้อมเลขที่เดิม (`02` §13) และยอดของใบนี้
 * หายจาก `pnd3/pnd53` ของรอบทันที (`33` §16)
 *
 * `input.reissue = true` ⇒ ออกใบแทนให้ในทรานแซกชันเดียวกัน พร้อม `replaces_certificate_id`
 * ชี้กลับฉบับนี้ (ครบ flow ของ `33` §10 โดยไม่ต้องมี endpoint เพิ่มนอก `27` §6.12)
 */
export async function cancelWhtCertificate(
  ctx: AccountingMutationContext,
  certificateId: string,
  input: WhtCancelInput,
  now: Date = new Date(),
): Promise<{ cancelled: WhtCertificateDto; replacement: WhtCertificateDto | null }> {
  const organizationId = ctx.actor.organizationId
  const certificate = await findCertificate(ctx.actor, certificateId)
  assertCertificateCancellable(certificate.status)
  const reason = requireWhtCancelReason(input.reason)

  await assertPeriodOpenAt({
    organizationId,
    at: certificate.paymentDate,
    targetType: CERT_TARGET,
    targetId: certificate.id,
  })

  const anchorRow = await prisma.expenseRecord.findFirst({
    where: { id: certificate.expenseRecordId, organizationId },
    select: EXPENSE_SOURCE_SELECT,
  })
  if (anchorRow === null) {
    throw new WhtError('WHT_CERTIFICATE_NOT_FOUND', { detail: `expense_record=${certificate.expenseRecordId}` })
  }
  const source = toSourceItem(anchorRow)
  // ออกแทนด้วยรูปแบบเดียวกับใบเดิม (ใบเดิมคือหลักฐานของรูปแบบที่ใช้ ไม่ดูค่าตั้งปัจจุบัน)
  const replacementGroup: SourceGroup | null =
    certificate.issueMode === 'per_payee_batch'
      ? (groupCertificateSources(
          await loadBatchSources(organizationId, source.payoutBatchItem.payoutBatchId, certificate.payeeId),
          'per_payee_batch',
          batchGroupingOptions(anchorRow),
        )[0] ?? null)
      : (groupCertificateSources([source], 'per_item', batchGroupingOptions(anchorRow))[0] ?? null)

  return prisma.$transaction(async (tx) => {
    // ยึดด้วยสถานะเดิม — สองคนกดยกเลิกพร้อมกัน คนที่สองได้ 0 แถวแล้วโดนปฏิเสธ
    const claimed = await tx.whtCertificate.updateMany({
      where: { id: certificate.id, status: 'active' },
      data: { status: 'cancelled', cancelReason: reason, cancelledBy: ctx.actor.id, cancelledAt: now },
    })
    if (claimed.count === 0) {
      throw new WhtError('WHT_CERTIFICATE_INVALID_STATUS', { detail: 'ใบนี้ถูกยกเลิกไปแล้วโดยผู้ใช้อื่น' })
    }

    await emitAudit(
      {
        organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: CERT_TARGET,
        targetId: certificate.id,
        before: { status: 'active', cancel_reason: null },
        after: {
          status: 'cancelled',
          cancel_reason: reason,
          cancelled_at: now.toISOString(),
          certificate_number: certificate.certificateNumber,
          wht_satang: certificate.whtSatang,
        },
        reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    const replacement =
      input.reissue && replacementGroup !== null ? await issueCertificate(tx, ctx, replacementGroup, certificate.id) : null

    // ยกเลิกอย่างเดียวก็ต้องคำนวณยอดรอบใหม่ (ออกใบแทนคำนวณให้แล้วใน `issueCertificate()`)
    // มติ PO U127 — ยกเลิกในเดือนที่ยื่นแล้ว = ติดธงต้องยื่นเพิ่มเติม (ออกใบแทนติดธงซ้ำใน `issueCertificate()`)
    await refreshFilingSummary(
      tx,
      {
        organizationId,
        periodId: source.periodId,
        periodLabel: source.period.periodLabel,
        yearBe: source.period.yearBe,
        month: source.period.month,
      },
      { certificateEvent: { at: now, certificateNumber: certificate.certificateNumber, action: 'cancelled' } },
    )

    const cancelled = await tx.whtCertificate.findUniqueOrThrow({
      where: { id: certificate.id },
      select: CERT_SELECT,
    })
    return { cancelled: toCertDto(cancelled), replacement: replacement === null ? null : toCertDto(replacement) }
  })
}

// ── GET /api/accounting/wht-filing-summary (`33` §14) ───────────────────────

export async function listWhtFilingSummaries(
  user: SessionUser,
  query: WhtFilingSummaryListQuery,
  now: Date = new Date(),
): Promise<WhtFilingSummaryListDto> {
  assertOrgWideReadable(user, 'wht-filing-summaries')
  const rows = await prisma.whtFilingSummary.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
    },
    orderBy: { filingDueDate: 'desc' },
    select: FILING_SELECT,
  })

  // มติ PO U127 — รอบที่ติดธงต้องยื่นเพิ่มเติม: คิดยอดปัจจุบันจากใบที่มีผลเพื่อแสดงยอดต่างจากที่ยื่น
  const items = await Promise.all(
    rows.map(async (row) =>
      toFilingDto(
        row,
        now,
        row.supplementaryRequiredAt === null
          ? null
          : await currentFilingAmounts(prisma, user.organizationId, row.periodId),
      ),
    ),
  )
  // รอบที่ยังไม่ยื่นและใกล้กำหนดที่สุด = ตัวที่ banner countdown ใช้ (`33` §8)
  const pending = items.filter((item) => item.status === 'pending').at(-1) ?? null

  return {
    items,
    pending,
    warning:
      pending === null
        ? null
        : filingOverdueWarning(
            {
              periodLabel: pending.periodLabel,
              status: pending.status,
              filingDueDate: new Date(pending.filingDueDate),
              filingMethod: pending.filingMethod,
              filingNominalDueDate:
                pending.filingNominalDueDate === null ? null : new Date(pending.filingNominalDueDate),
            },
            now,
          ),
  }
}

// ── PATCH /api/accounting/wht-filing-summary/:id/mark-filed (`33` §14) ──────

/**
 * บัญชียืนยันว่ายื่นแบบจริงแล้ว (นอกระบบ) — `pending → filed`
 * ไม่ผ่านยาม Period Lock โดยเจตนา (ดูหัวไฟล์) · `reason` = อ้างอิงการยื่นที่ตามต่อได้
 */
export async function markWhtFilingFiled(
  ctx: AccountingMutationContext,
  summaryId: string,
  input: WhtMarkFiledInput,
  now: Date = new Date(),
): Promise<WhtFilingSummaryDto> {
  assertOrgWideReadable(ctx.actor, 'wht-filing-summaries')
  const organizationId = ctx.actor.organizationId
  const summary = await prisma.whtFilingSummary.findFirst({
    where: { id: summaryId, organizationId },
    select: FILING_SELECT,
  })
  if (summary === null) {
    throw new WhtError('WHT_FILING_SUMMARY_NOT_FOUND', { detail: `wht_filing_summary=${summaryId}` })
  }
  assertFilingMarkable(summary.status)
  // staging E-015 (มติ PO 10/10/2569) — ภ.ง.ด. ยื่นรวมทั้งเดือน ⇒ Mark ก่อนสิ้นเดือนไม่ได้ (รอบจ่ายที่เกิดหลัง Mark
  // จะตกเดือนที่ "ยื่นแล้ว" ต้องยื่นเพิ่มเติม) · ตั้งแต่ 00:00 วันที่ 1 ของเดือนถัดไป Mark ได้ทุกวัน (รวมวันหยุด/ย้อนหลัง)
  const periodKey = { yearBe: summary.period.yearBe, month: summary.period.month }
  if (!isPeriodEnded(periodKey, now)) {
    throw new AccountingError('PERIOD_NOT_ENDED', {
      detail: `wht_filing_summary=${summary.id} now=${now.toISOString()}`,
      message: `งวด ${summary.periodLabel} ยังไม่สิ้นเดือน — บันทึกว่ายื่นแล้วได้ตั้งแต่ ${fmtDate(periodCloseAvailableFrom(periodKey))}`,
    })
  }

  const filed = await prisma.$transaction(async (tx) => {
    const claimed = await tx.whtFilingSummary.updateMany({
      where: { id: summary.id, status: 'pending' },
      data: { status: 'filed', filedAt: now, filedBy: ctx.actor.id },
    })
    if (claimed.count === 0) {
      throw new WhtError('WHT_FILING_ALREADY_FILED', { detail: 'รอบนี้ถูก mark ว่ายื่นแล้วโดยผู้ใช้อื่น' })
    }

    await emitAudit(
      {
        organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: FILING_TARGET,
        targetId: summary.id,
        before: { status: 'pending', filed_at: null },
        after: {
          status: 'filed',
          filed_at: now.toISOString(),
          period_label: summary.periodLabel,
          pnd3_satang: summary.pnd3Satang,
          pnd53_satang: summary.pnd53Satang,
          filing_due_date: summary.filingDueDate.toISOString(),
          filing_method: summary.filingMethod,
        },
        reason: input.reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return tx.whtFilingSummary.findUniqueOrThrow({ where: { id: summary.id }, select: FILING_SELECT })
  })

  return toFilingDto(filed, now)
}

// ── PATCH /api/accounting/wht-filing-summary/:id/mark-supplementary-filed (มติ PO U127) ──

/**
 * บัญชียืนยันว่ายื่นแบบเพิ่มเติมแล้ว (นอกระบบ) — ล้างธง "ต้องยื่นเพิ่มเติม" · ยอด `pnd*` ของรอบเลื่อนเป็น
 * ยอดปัจจุบันจากใบที่มีผล (= ยอดที่ยื่นรวมฉบับเพิ่มเติม) · สถานะคง `filed` (ไม่มีสถานะใหม่) · เหตุผลบังคับ + audit
 * ไม่ติดยาม Period Lock (เหตุผลเดียวกับ mark-filed — เป็นการบันทึกว่ายื่นแบบเสร็จ ไม่ใช่แก้ข้อมูลของงวด)
 */
export async function markWhtSupplementaryFiled(
  ctx: AccountingMutationContext,
  summaryId: string,
  input: WhtMarkSupplementaryFiledInput,
  now: Date = new Date(),
): Promise<WhtFilingSummaryDto> {
  assertOrgWideReadable(ctx.actor, 'wht-filing-summaries')
  const organizationId = ctx.actor.organizationId
  const summary = await prisma.whtFilingSummary.findFirst({
    where: { id: summaryId, organizationId },
    select: FILING_SELECT,
  })
  if (summary === null) {
    throw new WhtError('WHT_FILING_SUMMARY_NOT_FOUND', { detail: `wht_filing_summary=${summaryId}` })
  }
  assertSupplementaryFilingMarkable(summary)
  const flaggedAt = summary.supplementaryRequiredAt

  const updated = await prisma.$transaction(async (tx) => {
    const current = await currentFilingAmounts(tx, organizationId, summary.periodId)
    // compare-and-set ด้วยเวลาธงเดิม — มีการยกเลิก/ออกใบเพิ่มระหว่างนั้น (ธงเลื่อนเวลา) หรือมีคนบันทึกไปแล้ว ⇒ ปฏิเสธ
    const claimed = await tx.whtFilingSummary.updateMany({
      where: { id: summary.id, status: 'filed', supplementaryRequiredAt: flaggedAt },
      data: {
        supplementaryRequiredAt: null,
        supplementaryFiledAt: now,
        supplementaryFiledBy: ctx.actor.id,
        pnd1Satang: current.pnd1Satang,
        pnd3Satang: current.pnd3Satang,
        pnd53Satang: current.pnd53Satang,
      },
    })
    if (claimed.count === 0) {
      throw new WhtError('WHT_SUPPLEMENTARY_FILING_NOT_REQUIRED', {
        detail: 'ธงของรอบนี้เปลี่ยนไปแล้ว (มีผู้ใช้อื่นบันทึก หรือมีการยกเลิก/ออกใบเพิ่ม) — โหลดข้อมูลใหม่แล้วตรวจยอดอีกครั้ง',
      })
    }

    await emitAudit(
      {
        organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'update',
        targetType: FILING_TARGET,
        targetId: summary.id,
        before: {
          supplementary_required_at: flaggedAt?.toISOString() ?? null,
          pnd1_satang: summary.pnd1Satang,
          pnd3_satang: summary.pnd3Satang,
          pnd53_satang: summary.pnd53Satang,
        },
        after: {
          supplementary_required_at: null,
          supplementary_filed_at: now.toISOString(),
          period_label: summary.periodLabel,
          pnd1_satang: current.pnd1Satang,
          pnd3_satang: current.pnd3Satang,
          pnd53_satang: current.pnd53Satang,
        },
        reason: input.reason,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return tx.whtFilingSummary.findUniqueOrThrow({ where: { id: summary.id }, select: FILING_SELECT })
  })

  return toFilingDto(updated, now)
}

// ── GET /api/accounting/wht-certificates/:id/pdf (`28` §6.3) ────────────────

/**
 * ลำดับที่ในแบบ ภ.ง.ด. ของผู้รับ (มติ PO U96 #13) — นับในงวด + แบบเดียวกับใบนี้ (ชุดเดียวกับที่สรุปรอบนำส่ง/ไฟล์ 05 ใช้)
 */
async function loadFilingSequence(organizationId: string, certificate: CertRow): Promise<number | null> {
  const entries = await prisma.whtCertificate.findMany({
    where: {
      organizationId,
      filingForm: certificate.filingForm,
      expenseRecord: { periodId: certificate.expenseRecord.periodId },
    },
    select: { payeeId: true, certificateNumber: true, status: true },
  })
  return filingSequenceNumber(entries, certificate.payeeId)
}

/**
 * ข้อมูลดิบของใบ 50 ทวิ สำหรับ PDF — ประกอบเป็นข้อความที่ `buildWhtCertificateDoc()`
 * คู่สัญญาอ่านจาก **snapshot ของใบ** เท่านั้น (มติ PO U96 #4) — แก้โปรไฟล์/ข้อมูลองค์กรภายหลังไม่เปลี่ยนใบเดิม
 */
export async function getWhtCertificateDocSource(
  user: SessionUser,
  certificateId: string,
): Promise<WhtCertificateDocSource> {
  const certificate = await findCertificate(user, certificateId)
  const coverage =
    certificate.issueMode === 'per_payee_batch' && certificate.payoutBatchId !== null
      ? {
          payoutBatchName: certificate.expenseRecord.payoutBatchItem.payoutBatch.name,
          itemCount: await prisma.expenseRecord.count({
            where: {
              organizationId: user.organizationId,
              payoutBatchItem: { payoutBatchId: certificate.payoutBatchId, payeeId: certificate.payeeId },
            },
          }),
        }
      : null

  return {
    certificateNumber: certificate.certificateNumber,
    status: certificate.status,
    cancelReason: certificate.cancelReason,
    cancelledAt: certificate.cancelledAt,
    replacesCertificateNumber: certificate.replaces?.certificateNumber ?? null,
    deliveryFormat: certificate.deliveryFormat,
    filingForm: certificate.filingForm,
    incomeType: certificate.incomeType,
    paymentDate: certificate.paymentDate,
    grossSatang: certificate.grossSatang,
    whtSatang: certificate.whtSatang,
    issuedAt: certificate.createdAt,
    payeeType: certificate.payeeType,
    incomeCategory: certificate.expenseRecord.payoutBatchItem.whtIncomeCategory,
    whtCondition: certificate.whtCondition,
    filingSequence: await loadFilingSequence(user.organizationId, certificate),
    coverage,
    payer: {
      name: certificate.payerName,
      taxId: certificate.payerTaxId,
      address: certificate.payerAddress.trim() === '' ? EMPTY_FIELD_TEXT : certificate.payerAddress,
      branchLabel: whtPartyBranchLabel(certificate.payerBranchCode),
    },
    payerSigner: { name: certificate.payerSignerName, title: certificate.payerSignerTitle },
    payee: {
      name: payeeDisplayName({
        name: certificate.payeeName,
        nameTitle: certificate.payeeNameTitle,
        payeeType: certificate.payeeType,
      }),
      // ค่าที่ไม่มีตอนออกใบ — ห้ามเว้นว่างบนเอกสารทางการ
      taxId: certificate.payeeTaxId ?? EMPTY_FIELD_TEXT,
      address: certificate.payeeAddress ?? EMPTY_FIELD_TEXT,
      branchLabel: whtPartyBranchLabel(certificate.payeeBranchCode, certificate.payeeType),
    },
  }
}
