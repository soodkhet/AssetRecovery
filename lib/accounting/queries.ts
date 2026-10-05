import { AccountingError } from '@/lib/accounting/errors'
import {
  assertAuthorizeNote,
  assertExceptionEditable,
  assertExceptionTransition,
  AUTHORIZE_EXCEPTION,
  exceptionStatusLabel,
  MANAGE_EXCEPTIONS,
  summarizeExceptionCounts,
  summarizeExceptions,
  type ExceptionCountInput,
  type ExceptionSummary,
} from '@/lib/accounting/exception'
import {
  assertPeriodActionStatus,
  assertPeriodEnded,
  assertPeriodTransition,
  assertReadyToSend,
  assertUnlockAllowed,
  evaluateReadiness,
  isPeriodEnded,
  nextPeriodKey,
  periodCloseAvailableFrom,
  periodKeyOf,
  periodLabelOf,
  periodOrdinal,
  periodStatusLabel,
  MANAGE_ACCOUNTING_PERIOD,
  UNLOCK_PERIOD,
  type BillingRevenueMismatch,
  type DraftBillingBatchSummary,
  type UnbilledRevenueSummary,
  type PeriodKey,
  type ReadinessResult,
} from '@/lib/accounting/period'
import type {
  ExceptionAuthorizeInput,
  ExceptionCreateInput,
  ExceptionListQuery,
  ExceptionResolveInput,
  ExceptionUpdateInput,
  PeriodListQuery,
  PeriodReasonInput,
} from '@/lib/accounting/schemas'
import type { AccountingPeriodDto, ExceptionDto, ExceptionListDto, PeriodReadinessDto } from '@/lib/accounting/types'
import { emitAudit } from '@/lib/audit/audit'
import { hasCapability } from '@/lib/auth/permission'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { AccountingPeriodStatus } from '@/lib/generated/prisma/enums'
import { dispatchToCapability, ORGANIZATION_SCOPE } from '@/lib/notifications/dispatch'
import { exceptionCreatedMessage, periodSentToAccountantMessage } from '@/lib/notifications/messages'
import { prisma } from '@/lib/prisma'
import { exceptionLinkOf, exceptionModuleLabel } from '@/lib/reports/dashboard'
import { summarizeBillingBatch } from '@/lib/revenue/revenue'
import { periodLockPolicyFor } from '@/lib/settings/period-lock'
import { assertOrgWideReadable } from '@/lib/auth/scope'
import { fmtDate } from '@/lib/format/datetime'

/**
 * รอบบัญชี (ไฟล์ 30) + ข้อยกเว้น (ไฟล์ 34) — ชั้น DB (`27` §6.13 · §6.16)
 *
 * ### กติกาที่ห้ามหลุด
 * - **`critical_count`/`warning_count` เป็น derived** นับสดจาก `exceptions` ผ่าน index
 *   `idx_exceptions_period` (`30` §7.1) — ห้ามเพิ่มคอลัมน์ใน `accounting_periods`
 * - **Readiness Check ห้าม force ข้าม** (`30` §10) — `sendPeriod()` เรียก `assertReadyToSend()`
 *   ทุกครั้งโดยไม่มีทางลัด
 * - **`authorized` ไม่สืบทอดข้ามรอบ** (`34` §6.3) — exception ผูก `period_id` ตายตัว ไม่มี
 *   เส้นทางย้ายรอบของ record เดิม ปัญหาเดิมในรอบใหม่ = record ใหม่เสมอ
 * - **ทุก mutation ของ `accounting_periods` ต้องมี `reason`** — ตารางนี้อยู่หมวด `period_lock`
 *   ของ `lib/audit/reason-policy.ts` (Rule 03)
 * - รอบบัญชีเกิดเองเมื่อถึงเดือนใหม่ (`30` §9) ⇒ `ensurePeriod()` เป็น **idempotent** อาศัย
 *   unique `(organization_id, year_be, month)` กันซ้ำระดับ DB
 */

const PERIOD_TARGET = 'accounting_periods'
const EXCEPTION_TARGET = 'exceptions'

/** เพดานย้อนหลังของการเปิดรอบอัตโนมัติ — กันสร้างรอบเปล่ายาวเป็นสิบปีตอนใช้งานครั้งแรก */
const MAX_BACKFILL_MONTHS = 24

const AUTO_PERIOD_REASON = 'ระบบเปิดรอบบัญชีของเดือนใหม่อัตโนมัติ'

export interface AccountingMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

// ── รอบบัญชี: อ่าน/สร้าง ────────────────────────────────────────────────────

const PERIOD_SELECT = {
  id: true,
  periodLabel: true,
  yearBe: true,
  month: true,
  status: true,
  exportReady: true,
  lastReadinessCheckedAt: true,
  sentAt: true,
  lockedAt: true,
  sentByUser: { select: { fullName: true } },
  lockedByUser: { select: { fullName: true } },
} satisfies Prisma.AccountingPeriodSelect

type PeriodRow = Prisma.AccountingPeriodGetPayload<{ select: typeof PERIOD_SELECT }>

/**
 * เปิดรอบบัญชีของงวดที่ระบุถ้ายังไม่มี — **idempotent** (แข่งกันเรียกพร้อมกันได้ P2002 แล้วอ่านซ้ำ)
 * ใช้ร่วมกับ Phase 4.2/4.3 ที่ต้องผูก record เข้ารอบ (`bank_transactions`/`sales_records` ฯลฯ)
 */
export async function ensurePeriod(ctx: AccountingMutationContext, key: PeriodKey): Promise<PeriodRow> {
  const where = { organizationId: ctx.actor.organizationId, yearBe: key.yearBe, month: key.month }
  const existing = await prisma.accountingPeriod.findFirst({ where, select: PERIOD_SELECT })
  if (existing !== null) return existing

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.accountingPeriod.create({
        data: {
          organizationId: ctx.actor.organizationId,
          yearBe: key.yearBe,
          month: key.month,
          periodLabel: periodLabelOf(key),
          createdBy: ctx.actor.id,
        },
        select: PERIOD_SELECT,
      })
      await emitAudit(
        {
          organizationId: ctx.actor.organizationId,
          actorId: ctx.actor.id,
          actorRole: ctx.actor.roleName,
          action: 'create',
          targetType: PERIOD_TARGET,
          targetId: created.id,
          after: { period_label: created.periodLabel, status: created.status },
          reason: AUTO_PERIOD_REASON,
          ipAddress: ctx.meta.ipAddress,
          userAgent: ctx.meta.userAgent,
        },
        tx,
      )
      return created
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const raced = await prisma.accountingPeriod.findFirst({ where, select: PERIOD_SELECT })
    if (raced === null) throw error
    return raced
  }
}

/** งวดของ instant ตามปฏิทินไทย — จุดเสียบของโมดูลอื่นที่ต้องรู้ว่า record อยู่รอบไหน */
export async function ensurePeriodForDate(ctx: AccountingMutationContext, at: Date): Promise<PeriodRow> {
  return ensurePeriod(ctx, periodKeyOf(at))
}

/** เดือนแรกที่มีรายได้ในระบบ — ใช้เป็นขอบล่างของการเปิดรอบย้อนหลัง (ไม่มีข้อมูล = เดือนปัจจุบัน) */
async function earliestActivityKey(organizationId: string, current: PeriodKey): Promise<PeriodKey> {
  const oldest = await prisma.revenue.aggregate({
    where: { organizationId, deletedAt: null },
    _min: { revenueDate: true },
  })
  const date = oldest._min.revenueDate
  if (date === null || date === undefined) return current
  const key = periodKeyOf(date)
  const floor = periodOrdinal(current) - MAX_BACKFILL_MONTHS
  return periodOrdinal(key) < floor ? current : key
}

/**
 * เปิดรอบที่ยังไม่มีตั้งแต่เดือนแรกที่มีรายได้จนถึงเดือนปัจจุบัน — เรียกจาก `listPeriods()`
 * เพื่อให้ตารางปิดงวดมีทุกเดือนที่ต้องปิดจริง (`30` §9 "เดือนใหม่เริ่มต้น → collecting")
 */
async function backfillPeriods(ctx: AccountingMutationContext, now: Date): Promise<void> {
  const current = periodKeyOf(now)
  let cursor = await earliestActivityKey(ctx.actor.organizationId, current)
  while (periodOrdinal(cursor) <= periodOrdinal(current)) {
    await ensurePeriod(ctx, cursor)
    cursor = nextPeriodKey(cursor)
  }
}

/** ยอด exception แยก level/status ต่อรอบ — 1 query สำหรับทุกแถว (ไม่ N+1 · index `idx_exceptions_period`) */
async function exceptionSummaryByPeriod(
  organizationId: string,
  periodIds: readonly string[],
): Promise<Map<string, ExceptionSummary>> {
  const grouped = await prisma.exception.groupBy({
    by: ['periodId', 'level', 'status'],
    where: { organizationId, periodId: { in: [...periodIds] } },
    _count: { _all: true },
  })
  const buckets = new Map<string, ExceptionCountInput[]>()
  for (const row of grouped) {
    const rows = buckets.get(row.periodId) ?? []
    rows.push({ level: row.level, status: row.status, count: row._count._all })
    buckets.set(row.periodId, rows)
  }
  const map = new Map<string, ExceptionSummary>()
  for (const [periodId, rows] of buckets) map.set(periodId, summarizeExceptionCounts(rows))
  return map
}

interface LastExport {
  at: Date
  /** เวอร์ชันล่าสุด (เลขลำดับ — ป้าย `v1.x` มาจาก `exportVersionLabel()`) */
  version: number
}

/**
 * วัน Export + เวอร์ชันล่าสุดของแต่ละรอบ (`30` §7.1 — derived จาก `export_records` ไฟล์ 37)
 * เวอร์ชันเดินขึ้นอย่างเดียว ⇒ ค่าสูงสุดของ `generated_at`/`version` เป็นของชุดเดียวกันเสมอ
 */
async function lastExportByPeriod(
  organizationId: string,
  periodIds: readonly string[],
): Promise<Map<string, LastExport>> {
  const grouped = await prisma.exportRecord.groupBy({
    by: ['periodId'],
    where: { organizationId, periodId: { in: [...periodIds] } },
    _max: { generatedAt: true, version: true },
  })
  const map = new Map<string, LastExport>()
  for (const row of grouped) {
    const at = row._max.generatedAt
    const version = row._max.version
    if (at !== null && at !== undefined && version !== null && version !== undefined) {
      map.set(row.periodId, { at, version })
    }
  }
  return map
}

function toPeriodDto(
  row: PeriodRow,
  summary: ExceptionSummary,
  lastExport: LastExport | undefined,
  now: Date,
): AccountingPeriodDto {
  const key: PeriodKey = { yearBe: row.yearBe, month: row.month }
  return {
    id: row.id,
    periodLabel: row.periodLabel,
    yearBe: row.yearBe,
    month: row.month,
    periodEnded: isPeriodEnded(key, now),
    closeAvailableFrom: periodCloseAvailableFrom(key).toISOString(),
    status: row.status,
    statusLabel: periodStatusLabel(row.status),
    criticalCount: summary.criticalCount,
    warningCount: summary.warningCount,
    blockingCritical: summary.blockingCritical,
    openWarningCount: summary.open.warning,
    exportReady: row.exportReady,
    lastReadinessCheckedAt: row.lastReadinessCheckedAt?.toISOString() ?? null,
    exportedAt: lastExport?.at.toISOString() ?? null,
    latestExportVersion: lastExport?.version ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    sentByName: row.sentByUser?.fullName ?? null,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedByName: row.lockedByUser?.fullName ?? null,
    directEditLabel: periodLockPolicyFor(row.status).directEditLabel,
  }
}

/**
 * ตารางรอบบัญชี (`30` §8) — เปิดรอบที่ขาดให้ก่อนเสมอ (เดือนใหม่ต้องมีแถวโดยอัตโนมัติ)
 * ⚠️ การเปิดรอบเป็น mutation ที่ audit ครบ — ไม่ใช่ผลข้างเคียงเงียบ ๆ ของการอ่าน
 */
export async function listPeriods(
  ctx: AccountingMutationContext,
  query: PeriodListQuery,
  now: Date = new Date(),
): Promise<AccountingPeriodDto[]> {
  assertOrgWideReadable(ctx.actor, 'accounting-periods')
  await backfillPeriods(ctx, now)

  const rows = await prisma.accountingPeriod.findMany({
    where: {
      organizationId: ctx.actor.organizationId,
      ...(query.yearBe === undefined ? {} : { yearBe: query.yearBe }),
    },
    orderBy: [{ yearBe: 'desc' }, { month: 'desc' }],
    take: query.limit,
    select: PERIOD_SELECT,
  })

  const ids = rows.map((row) => row.id)
  const [counts, exports] = await Promise.all([
    exceptionSummaryByPeriod(ctx.actor.organizationId, ids),
    lastExportByPeriod(ctx.actor.organizationId, ids),
  ])
  return rows.map((row) => toPeriodDto(row, counts.get(row.id) ?? summarizeExceptionCounts([]), exports.get(row.id), now))
}

/** อ่านรอบบัญชีตาม id ในองค์กรของผู้เรียก — 404 แบบไม่ leak ข้ามองค์กร (ใช้ร่วมกับไฟล์ 36) */
export async function findPeriodById(user: SessionUser, periodId: string): Promise<PeriodRow> {
  const row = await prisma.accountingPeriod.findFirst({
    where: { id: periodId, organizationId: user.organizationId },
    select: PERIOD_SELECT,
  })
  if (row === null) throw new AccountingError('PERIOD_NOT_FOUND', { detail: `period=${periodId}` })
  return row
}

// ── Readiness Check (`30` §6.2) ─────────────────────────────────────────────

/**
 * เงื่อนไขที่ 1 — ยอดรอบวางบิลของงวดตรงกับรายได้ที่อยู่ในรอบนั้น (**บล็อก**)
 * (ยอดในรอบเทียบด้วย `summarizeBillingBatch()` ตัวเดียวกับที่ใช้ตอนสร้างรอบ — 3.6)
 * รายได้ที่ยังไม่วางบิลไม่อยู่ในข้อนี้แล้ว (มติ PO U87) — ดู `unbilledRevenueSummary()`
 */
async function billingRevenueMismatches(organizationId: string, key: PeriodKey): Promise<BillingRevenueMismatch[]> {
  const label = periodLabelOf(key)
  const batches = await prisma.billingBatch.findMany({
    where: { organizationId, period: label, deletedAt: null },
    orderBy: [{ batchNumber: 'asc' }],
    select: {
      id: true,
      batchNumber: true,
      totalSatang: true,
      company: { select: { name: true } },
      revenues: {
        where: { deletedAt: null },
        select: { grossSatang: true, vatSatang: true, totalSatang: true },
      },
    },
  })

  const mismatches: BillingRevenueMismatch[] = []
  for (const batch of batches) {
    const totals = summarizeBillingBatch(batch.revenues)
    if (totals.totalSatang !== batch.totalSatang) {
      mismatches.push({
        billingBatchId: batch.id,
        batchNumber: batch.batchNumber,
        companyName: batch.company.name,
        batchTotalSatang: batch.totalSatang,
        revenueTotalSatang: totals.totalSatang,
        reason: 'total_mismatch',
      })
    }
  }
  return mismatches
}

/**
 * รายได้ "ค้างรับ" ของงวด (มติ PO U87) — `revenue_date` ก่อนสิ้นงวด (งวดนี้หรือยกมา) และ ณ ตอนนี้ยังไม่อยู่ใน
 * รอบวางบิลที่ส่งลูกค้าแล้ว: ยังไม่ผูกรอบ · อยู่ในรอบร่าง · รอบที่ผูกถูกลบไปแล้ว
 * ใช้ร่วมกันระหว่างคำเตือนของ Readiness กับ `14_Unbilled_Revenue.csv` — นิยามต้องตรงกันเสมอ
 */
export function unbilledRevenueWhere(organizationId: string, periodEnd: Date): Prisma.RevenueWhereInput {
  return {
    organizationId,
    deletedAt: null,
    revenueDate: { lt: periodEnd },
    OR: [
      { billingBatchId: null },
      { billingBatch: { is: { status: 'draft' } } },
      { billingBatch: { is: { deletedAt: { not: null } } } },
    ],
  }
}

async function unbilledRevenueSummary(organizationId: string, periodEnd: Date): Promise<UnbilledRevenueSummary> {
  const rows = await prisma.revenue.findMany({
    where: unbilledRevenueWhere(organizationId, periodEnd),
    select: {
      totalSatang: true,
      companyId: true,
      company: { select: { name: true } },
      billingBatch: { select: { status: true, deletedAt: true } },
    },
  })
  const byCompany = new Map<string, { companyName: string; count: number; totalSatang: number }>()
  let totalSatang = 0
  let inDraftCount = 0
  for (const row of rows) {
    totalSatang += row.totalSatang
    if (row.billingBatch !== null && row.billingBatch.deletedAt === null && row.billingBatch.status === 'draft') {
      inDraftCount += 1
    }
    const current = byCompany.get(row.companyId) ?? { companyName: row.company.name, count: 0, totalSatang: 0 }
    current.count += 1
    current.totalSatang += row.totalSatang
    byCompany.set(row.companyId, current)
  }
  return {
    count: rows.length,
    totalSatang,
    inDraftCount,
    byCompany: [...byCompany.values()].sort((a, b) => a.companyName.localeCompare(b.companyName, 'th')),
  }
}

/** BUG-160 — รอบวางบิลร่างที่มีรายได้ของงวดนี้ (หรือยกมา) และยังไม่ส่งลูกค้า */
async function draftBillingBatchSummary(organizationId: string, periodEnd: Date): Promise<DraftBillingBatchSummary> {
  const batches = await prisma.billingBatch.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: 'draft',
      revenues: { some: { deletedAt: null, revenueDate: { lt: periodEnd } } },
    },
    orderBy: [{ batchNumber: 'asc' }],
    select: { batchNumber: true, totalSatang: true },
  })
  return {
    count: batches.length,
    totalSatang: batches.reduce((sum, batch) => sum + batch.totalSatang, 0),
    batchNumbers: batches.map((batch) => batch.batchNumber),
  }
}

/** ประกอบข้อมูลสด 3 เงื่อนไขแล้วส่งให้ตัวตัดสิน pure (`30` §6.2) */
async function readinessOf(organizationId: string, row: PeriodRow, now: Date): Promise<ReadinessResult> {
  const key: PeriodKey = { yearBe: row.yearBe, month: row.month }
  // สิ้นงวด (date-only UTC) — ยอดเงินรับรอตรวจสอบ/50 ทวิ ค้าง นับรายการที่เกิดก่อนสิ้นงวด (ยกมาจากงวดก่อนด้วย)
  const yearCe = row.yearBe - 543
  const periodEnd = new Date(Date.UTC(row.month === 12 ? yearCe + 1 : yearCe, row.month === 12 ? 0 : row.month, 1))
  const [
    openExceptions,
    unmatchedBankCount,
    billingMismatches,
    suspense,
    pendingWht,
    unbilledRevenue,
    draftBatches,
    awaitingReceiptInvoice,
  ] = await Promise.all([
    prisma.exception.findMany({
      where: { organizationId, periodId: row.id, status: 'open' },
      select: { id: true, level: true, title: true, sourceModule: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.bankTransaction.count({ where: { organizationId, periodId: row.id, matchStatus: 'unmatched' } }),
    billingRevenueMismatches(organizationId, key),
    // มติ PO U41/U40 — เตือนอย่างเดียว ไม่บล็อก
    prisma.bankTransaction.aggregate({
      where: { organizationId, matchStatus: 'suspense', transactionDate: { lt: periodEnd } },
      _count: { _all: true },
      _sum: { amountSatang: true },
    }),
    prisma.customerWhtCertificate.aggregate({
      where: { organizationId, deletedAt: null, status: 'pending', withheldDate: { lt: periodEnd } },
      _count: { _all: true },
      _sum: { withheldSatang: true },
    }),
    // มติ PO U87 / BUG-160 — เตือนอย่างเดียว ไม่บล็อก
    unbilledRevenueSummary(organizationId, periodEnd),
    draftBillingBatchSummary(organizationId, periodEnd),
    // มติ PO U95 #6 — เงินรับที่ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี (รอบที่ออกใบกำกับแบบเดิมแล้วไม่นับ)
    prisma.cashReceipt.aggregate({
      where: {
        organizationId,
        receivedDate: { lt: periodEnd },
        taxInvoices: { none: { status: 'active' } },
        billingBatch: {
          OR: [
            { salesRecord: null },
            { salesRecord: { taxInvoices: { none: { status: 'active', docKind: 'tax_invoice' } } } },
          ],
        },
      },
      _count: { _all: true },
      _sum: { amountSatang: true, whtWithheldByCustomerSatang: true },
    }),
  ])

  return evaluateReadiness({
    criticalOpen: openExceptions
      .filter((exception) => exception.level === 'critical')
      .map((exception) => ({ id: exception.id, title: exception.title, sourceModule: exception.sourceModule })),
    warningOpenCount: openExceptions.filter((exception) => exception.level === 'warning').length,
    unmatchedBankCount,
    billingMismatches,
    periodEnd: { key, now },
    suspenseOutstanding: { count: suspense._count._all, amountSatang: suspense._sum.amountSatang ?? 0 },
    pendingCustomerWht: { count: pendingWht._count._all, withheldSatang: pendingWht._sum.withheldSatang ?? 0 },
    unbilledRevenue,
    draftBillingBatches: draftBatches,
    receiptsAwaitingTaxInvoice: {
      count: awaitingReceiptInvoice._count._all,
      amountSatang:
        (awaitingReceiptInvoice._sum.amountSatang ?? 0) + (awaitingReceiptInvoice._sum.whtWithheldByCustomerSatang ?? 0),
    },
  })
}

export async function getPeriodReadiness(
  user: SessionUser,
  periodId: string,
  now: Date = new Date(),
): Promise<PeriodReadinessDto> {
  assertOrgWideReadable(user, 'accounting-periods')
  const row = await findPeriodById(user, periodId)
  const result = await readinessOf(user.organizationId, row, now)
  return { ...result, periodId: row.id, periodLabel: row.periodLabel, status: row.status }
}

// ── รอบบัญชี: เปลี่ยนสถานะ (`23` §6.13) ──────────────────────────────────────

/**
 * ทางลัดจำลองวันที่ของการส่ง/ล็อกงวด — **เฉพาะ dev** (มติ PO 05/10/2569 U65 · แบบเดียวกับ O10)
 * เข้าได้ทาง `/api/dev/accounting-periods/:id/(send|lock)` เท่านั้น (production = 404) · route จริงไม่รับเวลาจากผู้เรียก
 * วันจำลองใช้กับ**ยามสิ้นเดือน + Readiness** เท่านั้น · เวลาที่บันทึก (`sent_at`/`locked_at`) เป็นเวลาจริงเสมอ
 */
export interface PeriodCloseSimulation {
  simulatedNow: Date
}

/** ป้ายติด audit เมื่อใช้วันจำลอง — `[จำลองวันที่ DD/MM/YYYY]` (พ.ศ. ผ่าน `fmtDate()` กลาง) */
export function simulatedDateTag(simulatedNow: Date): string {
  return `[จำลองวันที่ ${fmtDate(simulatedNow)}]`
}

/** production ห้ามมีวันจำลองหลุดเข้ามาเด็ดขาด (กันชั้นที่สองต่อจาก route ที่ตอบ 404) */
function effectiveSimulation(simulation: PeriodCloseSimulation | undefined): PeriodCloseSimulation | undefined {
  return process.env.NODE_ENV === 'production' ? undefined : simulation
}

async function transitionPeriod(
  ctx: AccountingMutationContext,
  periodId: string,
  to: AccountingPeriodStatus,
  input: PeriodReasonInput,
  extra: { readiness?: ReadinessResult; unlock?: boolean; simulation?: PeriodCloseSimulation } = {},
  now: Date = new Date(),
): Promise<AccountingPeriodDto> {
  const row = await findPeriodById(ctx.actor, periodId)
  assertPeriodTransition(row.status, to)

  const data: Prisma.AccountingPeriodUpdateInput = { status: to }
  if (to === 'sent_to_accountant' && extra.unlock !== true) {
    data.sentAt = now
    data.sentByUser = { connect: { id: ctx.actor.id } }
    data.exportReady = true
    data.lastReadinessCheckedAt = now
  }
  if (to === 'locked') {
    data.lockedAt = now
    data.lockedByUser = { connect: { id: ctx.actor.id } }
  }
  if (extra.unlock === true) {
    data.lockedAt = null
    data.lockedByUser = { disconnect: true }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.accountingPeriod.update({ where: { id: periodId }, data, select: PERIOD_SELECT })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        // `02` §10 มี action `lock`/`unlock` ตรงตัว — ที่เหลือใช้ `status_change`
        action: to === 'locked' ? 'lock' : extra.unlock === true ? 'unlock' : 'status_change',
        targetType: PERIOD_TARGET,
        targetId: periodId,
        before: { status: row.status, locked_at: row.lockedAt },
        after: {
          status: next.status,
          locked_at: next.lockedAt,
          ...(extra.simulation === undefined ? {} : { simulated_as_of: simulatedDateTag(extra.simulation.simulatedNow) }),
        },
        reason:
          extra.simulation === undefined
            ? input.reason
            : `${input.reason} ${simulatedDateTag(extra.simulation.simulatedNow)}`,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return next
  })

  // `90` §6.3 (mockup `notifications.html` · `30` §9) — ส่งงวดให้สำนักงานบัญชีแล้วทีมบัญชีต้องรู้ทั้งทีม
  if (to === 'sent_to_accountant' && extra.unlock !== true) {
    dispatchToCapability(
      ctx.actor.organizationId,
      MANAGE_ACCOUNTING_PERIOD,
      ORGANIZATION_SCOPE,
      periodSentToAccountantMessage({ periodId, periodLabel: updated.periodLabel }),
    )
  }

  return toPeriodDto(updated, summarizeExceptionCounts([]), undefined, extra.simulation?.simulatedNow ?? now)
}

/**
 * `collecting → sent_to_accountant` — ผ่าน Readiness Check เสมอ **ห้าม force ข้าม** (`30` §10)
 * + ต้องสิ้นเดือนของงวดแล้ว (มติ PO U51 — `PERIOD_NOT_ENDED`) · `now` เปิดไว้ให้เทสต์เส้นขอบเท่านั้น
 * (route จริงไม่รับเวลาจากผู้เรียก) · `simulation` = วันจำลองของทางลัด dev เท่านั้น (U65 — {@link PeriodCloseSimulation})
 */
export async function sendPeriod(
  ctx: AccountingMutationContext,
  periodId: string,
  input: PeriodReasonInput,
  now: Date = new Date(),
  simulation?: PeriodCloseSimulation,
): Promise<AccountingPeriodDto> {
  assertOrgWideReadable(ctx.actor, 'accounting-periods')
  const sim = effectiveSimulation(simulation)
  const asOf = sim?.simulatedNow ?? now
  const row = await findPeriodById(ctx.actor, periodId)
  // เฉพาะ `collecting` — รอบที่ `locked` ต้องไปทาง `unlockPeriod()` ที่บังคับสิทธิ์ผู้บริหาร (`30` §10)
  assertPeriodActionStatus('send', row.status)
  assertPeriodEnded({ yearBe: row.yearBe, month: row.month }, asOf)
  const readiness = await readinessOf(ctx.actor.organizationId, row, asOf)
  assertReadyToSend(readiness)
  return transitionPeriod(
    ctx,
    periodId,
    'sent_to_accountant',
    input,
    { readiness, ...(sim === undefined ? {} : { simulation: sim }) },
    now,
  )
}

/** `sent_to_accountant → locked` — บัญชี/ผู้บริหารยืนยันปิดงวด (`30` §9) · ต้องสิ้นเดือนแล้ว (U51) */
export async function lockPeriod(
  ctx: AccountingMutationContext,
  periodId: string,
  input: PeriodReasonInput,
  now: Date = new Date(),
  simulation?: PeriodCloseSimulation,
): Promise<AccountingPeriodDto> {
  assertOrgWideReadable(ctx.actor, 'accounting-periods')
  const sim = effectiveSimulation(simulation)
  const row = await findPeriodById(ctx.actor, periodId)
  assertPeriodActionStatus('lock', row.status)
  assertPeriodEnded({ yearBe: row.yearBe, month: row.month }, sim?.simulatedNow ?? now)
  return transitionPeriod(ctx, periodId, 'locked', input, sim === undefined ? {} : { simulation: sim }, now)
}

/**
 * `locked → sent_to_accountant` — **ผู้บริหารเท่านั้น** (`30` §10 · `13` §6.11)
 * ผู้ที่ไม่มี `unlock_period` ระดับ manage ได้ `UNLOCK_REQUIRES_EXECUTIVE` (ไม่ใช่ `PERMISSION_DENIED`
 * — `30` §16 ระบุ code ไว้ตรงตัว) ⇒ route เปิดให้บัญชียิงเข้ามาได้แล้วมาตกที่ยามตัวนี้
 */
export async function unlockPeriod(
  ctx: AccountingMutationContext,
  periodId: string,
  input: PeriodReasonInput,
): Promise<AccountingPeriodDto> {
  assertOrgWideReadable(ctx.actor, 'accounting-periods')
  assertUnlockAllowed(ctx.actor.isSuperadmin || hasCapability(ctx.actor, 'manage', UNLOCK_PERIOD))
  // เฉพาะ `locked` — ไม่งั้นรอบที่ยัง `collecting` จะถูกส่งบัญชีโดยข้าม Readiness Check (`30` §10)
  assertPeriodActionStatus('unlock', (await findPeriodById(ctx.actor, periodId)).status)
  return transitionPeriod(ctx, periodId, 'sent_to_accountant', input, { unlock: true })
}

// ── Exception (`34`) ────────────────────────────────────────────────────────

const EXCEPTION_SELECT = {
  id: true,
  periodId: true,
  level: true,
  status: true,
  title: true,
  description: true,
  sourceModule: true,
  sourceRef: true,
  resolvedAt: true,
  resolutionNote: true,
  authorizedAt: true,
  authorizeNote: true,
  createdAt: true,
  period: { select: { periodLabel: true } },
  resolvedByUser: { select: { fullName: true } },
  authorizedByUser: { select: { fullName: true } },
  createdByUser: { select: { fullName: true } },
} satisfies Prisma.ExceptionSelect

type ExceptionRecord = Prisma.ExceptionGetPayload<{ select: typeof EXCEPTION_SELECT }>

function toExceptionDto(row: ExceptionRecord): ExceptionDto {
  return {
    id: row.id,
    periodId: row.periodId,
    periodLabel: row.period.periodLabel,
    level: row.level,
    status: row.status,
    statusLabel: exceptionStatusLabel(row.status),
    title: row.title,
    description: row.description,
    sourceModule: row.sourceModule,
    sourceModuleLabel: exceptionModuleLabel(row.sourceModule),
    sourceLink: exceptionLinkOf(row.sourceModule),
    sourceRef: row.sourceRef,
    resolvedByName: row.resolvedByUser?.fullName ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
    authorizedByName: row.authorizedByUser?.fullName ?? null,
    authorizedAt: row.authorizedAt?.toISOString() ?? null,
    authorizeNote: row.authorizeNote,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
  }
}

export async function listExceptions(user: SessionUser, query: ExceptionListQuery): Promise<ExceptionListDto> {
  assertOrgWideReadable(user, 'exceptions')
  const rows = await prisma.exception.findMany({
    where: {
      organizationId: user.organizationId,
      ...(query.periodId === undefined ? {} : { periodId: query.periodId }),
      ...(query.level === undefined ? {} : { level: query.level }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.module === undefined || query.module === '' ? {} : { sourceModule: query.module }),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: EXCEPTION_SELECT,
  })
  return { items: rows.map(toExceptionDto), summary: summarizeExceptions(rows) }
}

async function findException(user: SessionUser, exceptionId: string): Promise<ExceptionRecord> {
  const row = await prisma.exception.findFirst({
    where: { id: exceptionId, organizationId: user.organizationId },
    select: EXCEPTION_SELECT,
  })
  if (row === null) throw new AccountingError('EXCEPTION_NOT_FOUND', { detail: `exception=${exceptionId}` })
  return row
}

export async function createException(
  ctx: AccountingMutationContext,
  input: ExceptionCreateInput,
  now: Date = new Date(),
): Promise<ExceptionDto> {
  const period =
    input.periodId === undefined
      ? await ensurePeriod(ctx, periodKeyOf(now))
      : await findPeriodById(ctx.actor, input.periodId)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.exception.create({
      data: {
        organizationId: ctx.actor.organizationId,
        periodId: period.id,
        level: input.level,
        title: input.title,
        description: input.description,
        sourceModule: input.sourceModule,
        sourceRef: input.sourceRef,
        createdBy: ctx.actor.id,
      },
      select: EXCEPTION_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'create',
        targetType: EXCEPTION_TARGET,
        targetId: row.id,
        after: { level: row.level, title: row.title, source_module: row.sourceModule, period_id: row.periodId },
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return row
  })

  // `90` §6.3 แถว 9 — เฉพาะระดับ critical (ตัวที่ยัง open จะบล็อก Export Pack ของ `37`)
  if (created.level === 'critical') {
    dispatchToCapability(
      ctx.actor.organizationId,
      MANAGE_EXCEPTIONS,
      ORGANIZATION_SCOPE,
      exceptionCreatedMessage({ title: created.title, periodLabel: created.period.periodLabel }),
    )
  }

  return toExceptionDto(created)
}

/** แก้รายละเอียดได้เฉพาะขณะ `open` (`34` §14) — เปลี่ยนสถานะต้องผ่าน resolve/authorize เท่านั้น */
export async function updateException(
  ctx: AccountingMutationContext,
  exceptionId: string,
  input: ExceptionUpdateInput,
): Promise<ExceptionDto> {
  const row = await findException(ctx.actor, exceptionId)
  assertExceptionEditable(row.status)

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.exception.update({
      where: { id: exceptionId },
      data: { ...input, updatedBy: ctx.actor.id },
      select: EXCEPTION_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'update',
        targetType: EXCEPTION_TARGET,
        targetId: exceptionId,
        before: {
          level: row.level,
          title: row.title,
          description: row.description,
          source_module: row.sourceModule,
          source_ref: row.sourceRef,
        },
        after: {
          level: next.level,
          title: next.title,
          description: next.description,
          source_module: next.sourceModule,
          source_ref: next.sourceRef,
        },
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return next
  })

  return toExceptionDto(updated)
}

/** `open → resolved` — แก้ต้นทางจริงแล้ว ต้องมีคำอธิบายเสมอ (`34` §10 · §13) */
export async function resolveException(
  ctx: AccountingMutationContext,
  exceptionId: string,
  input: ExceptionResolveInput,
): Promise<ExceptionDto> {
  const row = await findException(ctx.actor, exceptionId)
  assertExceptionTransition(row.status, 'resolved')

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.exception.update({
      where: { id: exceptionId },
      data: {
        status: 'resolved',
        resolvedBy: ctx.actor.id,
        resolvedAt: new Date(),
        resolutionNote: input.resolutionNote,
        updatedBy: ctx.actor.id,
      },
      select: EXCEPTION_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'status_change',
        targetType: EXCEPTION_TARGET,
        targetId: exceptionId,
        before: { status: row.status },
        after: { status: next.status, resolution_note: next.resolutionNote },
        reason: input.resolutionNote,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return next
  })

  return toExceptionDto(updated)
}

/**
 * `open → authorized` — **ผู้บริหารเท่านั้น** + เหตุผลบังคับ แล้วสถานะเปลี่ยน**ทันที** (`34` §6.3)
 * ⚠️ ปลดบล็อกเฉพาะรอบของ record นี้เท่านั้น — รอบถัดไปที่เจอปัญหาเดิมต้องเป็น record ใหม่
 */
export async function authorizeException(
  ctx: AccountingMutationContext,
  exceptionId: string,
  input: ExceptionAuthorizeInput,
): Promise<ExceptionDto> {
  const note = assertAuthorizeNote(input.authorizeNote)
  const row = await findException(ctx.actor, exceptionId)
  assertExceptionTransition(row.status, 'authorized')

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.exception.update({
      where: { id: exceptionId },
      data: {
        status: 'authorized',
        authorizedBy: ctx.actor.id,
        authorizedAt: new Date(),
        authorizeNote: note,
        updatedBy: ctx.actor.id,
      },
      select: EXCEPTION_SELECT,
    })
    await emitAudit(
      {
        organizationId: ctx.actor.organizationId,
        actorId: ctx.actor.id,
        actorRole: ctx.actor.roleName,
        action: 'approve',
        targetType: EXCEPTION_TARGET,
        targetId: exceptionId,
        before: { status: row.status },
        after: { status: next.status, authorize_note: next.authorizeNote, period_id: next.periodId },
        // §13 — การข้ามกฎที่ตั้งใจไว้ ต้องเห็นเหตุผลใน audit ชัดเจน
        reason: note,
        ipAddress: ctx.meta.ipAddress,
        userAgent: ctx.meta.userAgent,
      },
      tx,
    )
    return next
  })

  return toExceptionDto(updated)
}

/** ใครยิง `POST /:id/authorize` ได้ — ผู้บริหารเท่านั้น (`25` §7.5 "✅ only") */
export function canAuthorizeException(user: SessionUser): boolean {
  return user.isSuperadmin || hasCapability(user, 'manage', AUTHORIZE_EXCEPTION)
}
