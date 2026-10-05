import { assertOrgWideReadable } from '@/lib/auth/scope'
import type { AccountingMutationContext } from '@/lib/accounting/queries'
import { assertPeriodOpenAt } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { toBangkokDateOnly } from '@/lib/revenue/revenue'
import { loadHolidayKeys } from '@/lib/settings/queries/holiday-keys'
import { resolveWhtFilingMethod } from '@/lib/settings/queries/wht-policy'
import { WHT_FILING_METHOD_SUFFIX } from '@/lib/settings/wht-policy'
import { WhtError } from '@/lib/wht/errors'
import type {
  WhtCancelInput,
  WhtCertificateListQuery,
  WhtFilingSummaryListQuery,
  WhtMarkFiledInput,
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
  daysUntilFilingDue,
  EMPTY_FIELD_TEXT,
  filingDueDateOf,
  filingDueDateText,
  filingDueLabel,
  filingMethodResolveDate,
  filingNominalDueDateOf,
  filingFormOf,
  filingOverdueWarning,
  groupCertificateSources,
  type CertificateGroupingOptions,
  incomeTypeOf,
  isFilingOverdue,
  nextCertificateSequence,
  requireWhtCancelReason,
  summarizeFilingTotals,
  whtCertificateNumber,
  whtCertificateNumberPrefix,
  WHT_CERTIFICATE_STATUS_LABEL,
  WHT_DELIVERY_FORMAT_LABEL,
  WHT_FILING_FORM_LABEL,
  WHT_FILING_STATUS_LABEL,
  type CertificateGroup,
  type WhtCertificateDocSource,
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
 * - `mark-filed` **ไม่ติดยาม Period Lock** โดยเจตนา — กำหนดยื่นคือวันที่ 15 ของเดือนถัดไป ซึ่งงวด
 *   นั้นมักถูกล็อกไปแล้ว (`13` §6.11 คุมการแก้ "ข้อมูลของงวด" ไม่ใช่การบันทึกว่ายื่นแบบเสร็จ)
 *   · การ**ยกเลิก**ใบยังติดยามตามปกติ เพราะกระทบยอดภาษีของงวด (แนวเดียวกับใบกำกับภาษี 4.3)
 */

const CERT_TARGET = 'wht_certificates'
const FILING_TARGET = 'wht_filing_summaries'

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
  payee: { select: { nationalId: true, user: { select: { fullName: true, phone: true } } } },
  cancelledByUser: { select: { fullName: true } },
  replaces: { select: { certificateNumber: true } },
  expenseRecord: {
    select: {
      periodId: true,
      period: { select: { periodLabel: true, yearBe: true, month: true } },
      payoutBatchItem: { select: { payoutBatchId: true, payoutBatch: { select: { name: true } } } },
    },
  },
} satisfies Prisma.WhtCertificateSelect

type CertRow = Prisma.WhtCertificateGetPayload<{ select: typeof CERT_SELECT }>

function toCertDto(row: CertRow): WhtCertificateDto {
  return {
    id: row.id,
    certificateNumber: row.certificateNumber,
    payeeId: row.payeeId,
    payeeName: row.payee.user.fullName,
    payeeTaxId: row.payee.nationalId,
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
} satisfies Prisma.WhtFilingSummarySelect

type FilingRow = Prisma.WhtFilingSummaryGetPayload<{ select: typeof FILING_SELECT }>

function toFilingDto(row: FilingRow, now: Date): WhtFilingSummaryDto {
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
  }
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
    select: { id: true },
  })

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
 * กุญแจ advisory lock ของตัวเดินเลขใบ 50 ทวิ — ค่าคงที่ (ไม่ผูกกับองค์กร) เพราะ
 * `wht_certificates.certificate_number` เป็น **UNIQUE ทั้งตาราง** ตาม `02` §9 ⇒ ลำดับเลขต้อง
 * เดินร่วมกันทั้งระบบ ไม่ใช่แยกต่อองค์กร (ถ้าล็อกแยกต่อองค์กร สองคำขอคนละองค์กรจะชนเลขกัน)
 */
const WHT_NUMBER_LOCK_KEY = 33_50_02

/** เลขที่ถัดไปของปีนั้น — อ่าน**หลัง**ได้ล็อกเสมอ (D11) ไม่งั้นสองคำขอได้เลขซ้ำ */
async function reserveCertificateNumber(tx: TxClient, paymentDate: Date): Promise<string> {
  // ล็อกระดับทรานแซกชัน — ปลดเองเมื่อ commit/rollback ⇒ คำขอที่เข้ามาพร้อมกันต่อคิวกันจริง
  // cast เป็น text เพราะ Prisma อ่านคอลัมน์ชนิด `void` ของ pg ไม่ได้
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${WHT_NUMBER_LOCK_KEY}::bigint)::text`

  const prefix = whtCertificateNumberPrefix(paymentDate)
  const issued = await tx.whtCertificate.findMany({
    where: { certificateNumber: { startsWith: prefix } },
    select: { certificateNumber: true },
  })

  return whtCertificateNumber(
    nextCertificateSequence(
      issued.map((row) => row.certificateNumber),
      prefix,
    ),
    paymentDate,
  )
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
      payee: { select: { id: true, payeeType: true, user: { select: { fullName: true } } } },
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
): Promise<CertRow> {
  const organizationId = ctx.actor.organizationId
  const source = group.anchor
  const item = source.payoutBatchItem
  const paymentDate = paymentDateOf(source)
  const certificateNumber = await reserveCertificateNumber(tx, paymentDate)
  const incomeCategory = item.whtIncomeCategory
  const filingForm = filingFormOf({
    taxProfileFilingForm: item.taxProfile?.filingForm ?? null,
    payeeType: item.payee.payeeType,
    incomeCategory,
  })
  const perBatch = group.mode === 'per_payee_batch'

  const created = await tx.whtCertificate.create({
    data: {
      organizationId,
      certificateNumber,
      payeeId: item.payee.id,
      expenseRecordId: source.id,
      incomeType: incomeTypeOf(item.taxProfile?.incomeType ?? null, incomeCategory),
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
        payee_name: item.payee.user.fullName,
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
          ? `ออกหนังสือรับรองหัก ณ ที่จ่าย ${certificateNumber} อัตโนมัติจากรอบจ่าย "${item.payoutBatch.name}" ที่จ่ายเงินจริงแล้ว`
          : `ออกหนังสือรับรอง ${certificateNumber} แทนฉบับที่ถูกยกเลิก`,
      ipAddress: ctx.meta.ipAddress,
      userAgent: ctx.meta.userAgent,
    },
    tx,
  )

  await refreshFilingSummary(tx, {
    organizationId,
    periodId: source.periodId,
    periodLabel: source.period.periodLabel,
    yearBe: source.period.yearBe,
    month: source.period.month,
  })

  return created
}

/**
 * **จุดเสียบของไฟล์ 32** — รอบจ่ายที่ `completed` มีบัญชีค่าใช้จ่ายแล้ว ⇒ ออกใบ 50 ทวิ ให้ทุกรายการ
 * ที่มีการหักภาษีจริง (`33` §9) — idempotent เรียกซ้ำไม่สร้างซ้ำ (1 รายการ = 1 ใบที่ `active`)
 */
export async function syncWhtCertificatesFromPayout(
  ctx: AccountingMutationContext,
  payoutBatchId: string,
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

    try {
      issued.push(
        await prisma.$transaction((tx) => issueCertificate(tx, ctx, group, existing?.id ?? null)),
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

  return issued.map(toCertDto)
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
      ...(query.periodId === undefined ? {} : { expenseRecord: { periodId: query.periodId } }),
    },
    orderBy: [{ paymentDate: 'desc' }, { certificateNumber: 'desc' }],
    select: CERT_SELECT,
  })

  return { items: rows.map(toCertDto), summary: summarizeFilingTotals(rows) }
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
    if (replacement === null) {
      await refreshFilingSummary(tx, {
        organizationId,
        periodId: source.periodId,
        periodLabel: source.period.periodLabel,
        yearBe: source.period.yearBe,
        month: source.period.month,
      })
    }

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

  const items = rows.map((row) => toFilingDto(row, now))
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

// ── GET /api/accounting/wht-certificates/:id/pdf (`28` §6.3) ────────────────

/** ผู้จ่ายเงิน = องค์กรเจ้าของระบบ (`28` §6.3 — ฟิลด์บังคับตามกฎหมาย) */
async function loadPayer(organizationId: string): Promise<{
  name: string
  taxId: string
  address: string
  phone: string | null
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, taxId: true, address: true, phone: true },
  })
  if (org === null) throw new Error(`loadPayer: ไม่พบองค์กร ${organizationId}`)
  return org
}

/** ข้อมูลดิบของใบ 50 ทวิ สำหรับ PDF — ประกอบเป็นข้อความที่ `buildWhtCertificateDoc()` */
export async function getWhtCertificateDocSource(
  user: SessionUser,
  certificateId: string,
): Promise<WhtCertificateDocSource> {
  const certificate = await findCertificate(user, certificateId)
  const payer = await loadPayer(user.organizationId)
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
    coverage,
    payer: { ...payer },
    payee: {
      name: certificate.payee.user.fullName,
      // `payee_profiles` ไม่มีคอลัมน์ที่อยู่ (D15) — ห้ามเว้นว่างบนเอกสารทางการ
      taxId: certificate.payee.nationalId ?? EMPTY_FIELD_TEXT,
      address: EMPTY_FIELD_TEXT,
      phone: certificate.payee.user.phone,
    },
  }
}
