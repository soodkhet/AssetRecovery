import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  arOutstandingSatang,
  daysOverdue,
  summarizeArAging,
  type ArAgingRow,
} from '@/lib/finance/ar-calc'
import type { Prisma } from '@/lib/generated/prisma/client'
import { netAfterAdjustments } from '@/lib/adjustments/adjustment'
import type {
  AdjustmentStatus,
  AdjustmentType,
  BillingBatchStatus,
  RevenueStatus,
} from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { RevenueError } from '@/lib/revenue/errors'
import {
  assertBillingBatchDeletable,
  assertBillingBatchSendable,
  assertHasRevenueToBill,
  assertRevenueEditable,
  billingPeriodLabel,
  periodStartOf,
  resolveBillingStatusAfterReceipt,
  summarizeBillingBatch,
  toBangkokDateOnly,
} from '@/lib/revenue/revenue'
import type {
  BillingBatchCreateInput,
  BillingBatchDeleteInput,
  BillingBatchListQuery,
  BillingBatchSendInput,
  ArAgingQuery,
  RevenueListQuery,
} from '@/lib/revenue/schemas'
import type {
  ArAgingCompanyDto,
  ArAgingReportDto,
  BillingBatchDetailDto,
  BillingBatchDto,
  RevenueDto,
} from '@/lib/revenue/types'
import { resolveDueDate } from '@/lib/settings/cycles'
import { FinanceCompanyError } from '@/lib/finance-companies/errors'
import { SettingsError } from '@/lib/settings/errors'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'
import { toDateOnlyIso, toIso } from '@/lib/settings/queries/shared'

/**
 * รายได้ / รอบวางบิล / ลูกหนี้คงค้าง — ชั้น DB (ไฟล์ 19 · `27` §6.7)
 *
 * ### กติกาที่ห้ามหลุด
 * - **การสร้าง Revenue ไม่ได้อยู่ที่นี่** — เกิดอัตโนมัติจาก `tryCreateRevenue()`
 *   (`lib/warehouse/revenue-service.ts`) ตอน lot confirm / expense approved เท่านั้น (`19` §6.1)
 *   ไม่มี endpoint ให้สร้าง/แก้ยอดรายได้ด้วยมือ — แก้ยอดต้องผ่าน Adjustment (ไฟล์ 20)
 * - **1 บริษัท 1 รอบเดือน = 1 Billing Batch** (`19` §6.2) บังคับด้วย unique
 *   `(organization_id, company_id, period)` ของ `02` §8 — ชนกันเมื่อไหร่คืน `NO_REVENUE_TO_BILL`
 *   ไม่ได้ เพราะคนละเรื่อง ⇒ ปล่อยให้ Prisma โยน P2002 ขึ้นไปเป็น 500 ไม่ได้เช่นกัน จึงเช็คก่อนสร้าง
 * - **ยอดรวมของรอบมาจาก `summarizeBillingBatch()`** (pure) ห้ามบวกเองที่นี่ ·
 *   ยอดค้างจาก `arOutstandingSatang()` (`22` §6.11) · ช่วงอายุหนี้จาก `finance_policy_settings`
 * - **`received_amount` ห้ามกรอกมือ** (`19` §9.2) — อัปเดตผ่าน `applyBillingReceipt()` ที่ไฟล์ 35
 *   (Phase 4.2) เรียกเท่านั้น
 * - scope ระดับแถว: Company User เห็นเฉพาะบริษัทตัวเอง (`25` §7 — ไม่ leak ข้ามบริษัท)
 */

export { MANAGE_BILLING } from '@/lib/revenue/revenue'

/** capability ที่เปิดประตูเข้า endpoint อ่าน (`19` §12) — ขอบเขตแถวบังคับซ้ำที่ `*ScopeWhere()` */
export const BILLING_READ_CAPABILITIES = ['manage_billing', 'view_own_company_data'] as const

const TARGET = 'billing_batches'

export interface RevenueMutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

// ── scope ระดับแถว ──────────────────────────────────────────────────────────

/**
 * รายได้/รอบวางบิลผูกกับบริษัทไฟแนนซ์ตรง ๆ — ทีม/พนักงานสนามไม่มีสิทธิ์เห็นตัวเลขรายได้เลย
 * (capability ของฝั่งนั้นไม่มี `manage_billing`) จึงเหลือแค่ `global` กับ `company`
 */
function companyScopeFilter(user: SessionUser): { companyId?: string } | null {
  const scope = user.scope
  if (scope.kind === 'global') return {}
  if (scope.kind === 'company') return scope.companyId === null ? null : { companyId: scope.companyId }
  return null
}

/**
 * สถานะรอบวางบิลที่ฝั่ง**บริษัทไฟแนนซ์**มองเห็นได้ (`97` §6.2/§11) — `draft` ยังไม่ถูกยืนยันความ
 * ถูกต้องจากฝั่งเรา ⇒ **ห้ามให้บริษัทเห็นเด็ดขาด** ไม่ว่าจะเข้ามาทางพอร์ทัลหรือ endpoint ภายใน
 */
const COMPANY_VISIBLE_BATCH_STATUSES: readonly BillingBatchStatus[] = ['sent', 'partially_paid', 'paid']

/** `true` = ผู้เรียกเป็นฝั่งบริษัท (ไม่ใช่คนในองค์กรเรา) ⇒ ต้องกรอง `draft` ออกทุกเส้นทาง */
function isCompanySideViewer(user: SessionUser): boolean {
  return !user.isSuperadmin && user.scope.kind === 'company'
}

/** ยามกรอง `draft` สำหรับฝั่งบริษัท — ใช้กับทุก query ของ billing batch (list/detail) */
function companyVisibilityWhere(user: SessionUser): Prisma.BillingBatchWhereInput {
  return isCompanySideViewer(user) ? { status: { in: [...COMPANY_VISIBLE_BATCH_STATUSES] } } : {}
}

/** `null` = ผู้ใช้ไม่มีสิทธิ์เห็นแถวใดเลย ⇒ where ที่ไม่มีทางแมตช์ (ไม่ leak ว่ามีข้อมูลอยู่) */
function scopeWhere(user: SessionUser, companyId?: string): { companyId?: string } | { id: { in: [] } } {
  const scoped = companyScopeFilter(user)
  if (scoped === null) return { id: { in: [] } }
  if (companyId === undefined) return scoped
  // ขอดูบริษัทอื่นทั้งที่ scope ล็อกไว้บริษัทเดียว = ไม่มีผลลัพธ์ (ไม่ใช่ 403 — ไม่ leak)
  if (scoped.companyId !== undefined && scoped.companyId !== companyId) return { id: { in: [] } }
  return { companyId }
}

// ── select / mapper ─────────────────────────────────────────────────────────

const revenueSelect = {
  id: true,
  caseId: true,
  companyId: true,
  trackingRound: true,
  revenueDate: true,
  feeModelSnapshot: true,
  grossSatang: true,
  vatSatang: true,
  vatRatePctUsed: true,
  totalSatang: true,
  status: true,
  billingBatchId: true,
  createdAt: true,
  case: { select: { caseRef: true, debtorName: true } },
  company: { select: { name: true } },
  billingBatch: { select: { period: true } },
} as const

type RevenueRow = Prisma.RevenueGetPayload<{ select: typeof revenueSelect }>

function toRevenueDto(row: RevenueRow): RevenueDto {
  return {
    id: row.id,
    caseId: row.caseId,
    caseRef: row.case.caseRef,
    debtorName: row.case.debtorName,
    companyId: row.companyId,
    companyName: row.company.name,
    trackingRound: row.trackingRound,
    revenueDate: toDateOnlyIso(row.revenueDate),
    feeModelSnapshot: row.feeModelSnapshot,
    grossSatang: row.grossSatang,
    vatSatang: row.vatSatang,
    vatRatePctUsed: row.vatRatePctUsed.toNumber(),
    totalSatang: row.totalSatang,
    status: row.status,
    billingBatchId: row.billingBatchId,
    billingBatchPeriod: row.billingBatch?.period ?? null,
    createdAt: toIso(row.createdAt),
  }
}

const batchSelect = {
  id: true,
  companyId: true,
  period: true,
  status: true,
  totalSatang: true,
  receivedSatang: true,
  whtWithheldByCustomerSatang: true,
  dueDate: true,
  sentAt: true,
  createdAt: true,
  company: { select: { name: true, vatMode: true } },
  createdByUser: { select: { fullName: true } },
  _count: { select: { revenues: true } },
} as const

type BatchRow = Prisma.BillingBatchGetPayload<{ select: typeof batchSelect }>

function toBatchDto(row: BatchRow, asOf: Date): BillingBatchDto {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    companyVatMode: row.company.vatMode,
    period: row.period,
    status: row.status,
    totalSatang: row.totalSatang,
    receivedSatang: row.receivedSatang,
    whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    outstandingSatang: arOutstandingSatang({
      totalSatang: row.totalSatang,
      receivedSatang: row.receivedSatang,
      whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    }),
    dueDate: toDateOnlyIso(row.dueDate),
    daysOverdue: daysOverdue(row.dueDate, asOf),
    sentAt: row.sentAt === null ? null : toIso(row.sentAt),
    revenueCount: row._count.revenues,
    createdAt: toIso(row.createdAt),
    createdByName: row.createdByUser.fullName,
  }
}

// ── GET /api/revenues (`19` §14) ────────────────────────────────────────────

export async function listRevenues(user: SessionUser, query: RevenueListQuery): Promise<RevenueDto[]> {
  const rows = await prisma.revenue.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ...scopeWhere(user, query.companyId),
      ...(query.status === 'all' ? {} : { status: query.status as RevenueStatus }),
      ...(query.unbilledOnly ? { billingBatchId: null } : {}),
      ...(query.dateFrom === undefined && query.dateTo === undefined
        ? {}
        : {
            revenueDate: {
              ...(query.dateFrom === undefined ? {} : { gte: query.dateFrom }),
              // `revenue_date` เป็นคอลัมน์ `DATE` ⇒ เที่ยงคืน UTC ตรง ๆ นับรวมทั้งวันอยู่แล้ว
              ...(query.dateTo === undefined ? {} : { lte: query.dateTo }),
            },
          }),
    },
    select: revenueSelect,
    orderBy: [{ revenueDate: 'desc' }, { createdAt: 'desc' }],
    take: 500,
  })
  return rows.map(toRevenueDto)
}

/**
 * ยามก่อน "แก้ยอดรายได้" (`19` §10/§11 `EDIT_BILLED_REVENUE`) — จุดเรียกคือ Adjustment (ไฟล์ 20)
 * ที่ต้องรู้ว่ารายการนี้ยังแก้ตรงได้ไหม · แยกไว้ที่นี่เพราะสถานะที่ตัดสินคือของ **รอบวางบิล** ไม่ใช่
 * ของตัว Revenue เอง (ใบที่อยู่ในรอบ `draft` ยังแก้ได้ ใบที่รอบส่งไปแล้วต้องผ่าน Adjustment)
 */
export async function assertRevenueAmountEditable(user: SessionUser, revenueId: string): Promise<void> {
  const row = await prisma.revenue.findFirst({
    where: { id: revenueId, organizationId: user.organizationId, deletedAt: null, ...scopeWhere(user) },
    select: { billingBatch: { select: { status: true } } },
  })
  if (row === null) throw new RevenueError('BILLING_BATCH_NOT_FOUND', { detail: `revenue=${revenueId}` })
  assertRevenueEditable(row.billingBatch?.status ?? null)
}

// ── GET /api/billing-batches ────────────────────────────────────────────────

export async function listBillingBatches(
  user: SessionUser,
  query: BillingBatchListQuery,
  now: Date = new Date(),
): Promise<BillingBatchDto[]> {
  const rows = await prisma.billingBatch.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ...scopeWhere(user, query.companyId),
      ...companyVisibilityWhere(user),
      ...(query.status === 'all' ? {} : { status: query.status as BillingBatchStatus }),
    },
    select: batchSelect,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  })
  return rows.map((row) => toBatchDto(row, now))
}

async function findBatch(user: SessionUser, batchId: string): Promise<BatchRow> {
  const row = await prisma.billingBatch.findFirst({
    where: {
      id: batchId,
      organizationId: user.organizationId,
      deletedAt: null,
      ...scopeWhere(user),
      ...companyVisibilityWhere(user),
    },
    select: batchSelect,
  })
  if (row === null) throw new RevenueError('BILLING_BATCH_NOT_FOUND', { detail: `batch=${batchId}` })
  return row
}

export async function getBillingBatch(
  user: SessionUser,
  batchId: string,
  now: Date = new Date(),
): Promise<BillingBatchDetailDto> {
  const batch = await findBatch(user, batchId)
  const revenues = await prisma.revenue.findMany({
    where: { billingBatchId: batchId, organizationId: user.organizationId, deletedAt: null },
    select: revenueSelect,
    orderBy: [{ revenueDate: 'asc' }],
  })
  return { ...toBatchDto(batch, now), revenues: revenues.map(toRevenueDto) }
}

// ── POST /api/billing-batches (`19` §9.1) ───────────────────────────────────

/**
 * วันครบกำหนดชำระ (`19` §7.2) — รอบบิล `AR` ที่ผู้ใช้เลือกชนะเสมอ (`13` §6.1 เป็นที่ตั้งกติกา)
 * ไม่ได้เลือกรอบ ⇒ ใช้ `finance_companies.payment_due_days` ของบริษัทนั้นเป็น Net N วัน (`02` §5)
 * — จำเป็นเพราะ `billing_payout_cycles.scope` เป็น free text จับคู่บริษัทอัตโนมัติไม่ได้
 */
async function resolveBatchDueDate(input: {
  organizationId: string
  cycleId: string | null
  cutoffDate: Date
  paymentDueDays: number
}): Promise<{ dueDate: Date; source: string }> {
  if (input.cycleId === null) {
    return {
      dueDate: resolveDueDate(input.cutoffDate, { dueRuleType: 'net_days', dueRuleValue: input.paymentDueDays }),
      source: `company.payment_due_days=${input.paymentDueDays}`,
    }
  }

  const cycle = await prisma.billingPayoutCycle.findFirst({
    where: { id: input.cycleId, organizationId: input.organizationId, deletedAt: null, type: 'AR' },
    select: { id: true, name: true, dueRuleType: true, dueRuleValue: true },
  })
  if (cycle === null) throw new SettingsError('CYCLE_NOT_FOUND', { detail: `cycle=${input.cycleId} (type=AR)` })

  return {
    dueDate: resolveDueDate(input.cutoffDate, cycle),
    source: `cycle=${cycle.name} (${cycle.dueRuleType}${cycle.dueRuleValue === null ? '' : ` ${cycle.dueRuleValue}`})`,
  }
}

export async function createBillingBatch(
  context: RevenueMutationContext,
  input: BillingBatchCreateInput,
  now: Date = new Date(),
): Promise<BillingBatchDetailDto> {
  const user = context.actor
  const company = await prisma.financeCompany.findFirst({
    where: { id: input.companyId, organizationId: user.organizationId, deletedAt: null, ...scopeWhere(user) },
    select: { id: true, name: true, paymentDueDays: true },
  })
  if (company === null) throw new FinanceCompanyError('COMPANY_NOT_FOUND', { detail: `company=${input.companyId}` })

  const period = billingPeriodLabel(input.cutoffDate)
  const periodStart = periodStartOf(input.cutoffDate)

  // 1 บริษัท 1 รอบเดือน = 1 batch (`19` §6.2 + unique `02` §8) — เช็คก่อนเพื่อไม่ให้ P2002 กลายเป็น 500
  const existing = await prisma.billingBatch.findFirst({
    where: { organizationId: user.organizationId, companyId: company.id, period },
    select: { id: true, status: true },
  })
  if (existing !== null) {
    throw new RevenueError('BILLING_BATCH_INVALID_STATUS', {
      detail: `มีรอบวางบิลของ ${company.name} งวด ${period} อยู่แล้ว (id=${existing.id} status=${existing.status})`,
      context: { existingBatchId: existing.id, period },
    })
  }

  const { dueDate, source } = await resolveBatchDueDate({
    organizationId: user.organizationId,
    cycleId: input.cycleId,
    cutoffDate: input.cutoffDate,
    paymentDueDays: company.paymentDueDays,
  })

  const batchId = await prisma.$transaction(async (tx) => {
    // รายได้ที่พร้อมวางบิลของบริษัทนี้ในงวด — ยึดเฉพาะใบที่ยังไม่ผูกรอบใด (กันสองรอบแย่งใบเดียวกัน)
    const candidates = await tx.revenue.findMany({
      where: {
        organizationId: user.organizationId,
        companyId: company.id,
        deletedAt: null,
        status: 'ready_for_billing',
        billingBatchId: null,
        revenueDate: { gte: periodStart, lte: input.cutoffDate },
      },
      select: { id: true, grossSatang: true, vatSatang: true, totalSatang: true },
    })
    assertHasRevenueToBill(candidates.length, `company=${company.id} period=${period}`)

    const totals = summarizeBillingBatch(candidates)
    const batch = await tx.billingBatch.create({
      data: {
        organizationId: user.organizationId,
        companyId: company.id,
        period,
        status: 'draft',
        totalSatang: totals.totalSatang,
        dueDate,
        createdBy: user.id,
      },
      select: { id: true },
    })

    const claimed = await tx.revenue.updateMany({
      where: { id: { in: candidates.map((row) => row.id) }, billingBatchId: null },
      data: { billingBatchId: batch.id, status: 'billed', updatedBy: user.id },
    })
    if (claimed.count !== candidates.length) {
      throw new RevenueError('NO_REVENUE_TO_BILL', {
        detail: `รายได้บางใบถูกดึงเข้ารอบวางบิลอื่นไปแล้ว (${claimed.count}/${candidates.length})`,
      })
    }

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: batch.id,
        after: {
          company_id: company.id,
          period,
          status: 'draft',
          // `02` §8 ไม่มีคอลัมน์ `cutoff_date`/`due_rule` ⇒ เก็บที่มาของวันครบกำหนดไว้ใน audit
          cutoff_date: toDateOnlyIso(input.cutoffDate),
          due_date: toDateOnlyIso(dueDate),
          due_date_source: source,
          gross_satang: totals.grossSatang,
          vat_satang: totals.vatSatang,
          total_satang: totals.totalSatang,
          revenue_count: totals.revenueCount,
          revenue_ids: candidates.map((row) => row.id),
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return batch.id
  })

  return getBillingBatch(user, batchId, now)
}

// ── PATCH /api/billing-batches/:id/send ─────────────────────────────────────

export async function sendBillingBatch(
  context: RevenueMutationContext,
  batchId: string,
  _input: BillingBatchSendInput,
  now: Date = new Date(),
): Promise<BillingBatchDetailDto> {
  const user = context.actor
  const batch = await findBatch(user, batchId)
  assertBillingBatchSendable(batch.status)

  await prisma.$transaction(async (tx) => {
    // ยึดด้วยสถานะเดิม — สองคนกดส่งพร้อมกัน คนที่สองได้ 0 แถวแล้วโดนปฏิเสธ (ไม่ทับ `sent_at`)
    const claimed = await tx.billingBatch.updateMany({
      where: { id: batchId, status: 'draft' },
      data: { status: 'sent', sentAt: now, sentBy: user.id, updatedBy: user.id },
    })
    if (claimed.count === 0) {
      throw new RevenueError('BILLING_BATCH_INVALID_STATUS', { detail: 'รอบนี้ถูกส่งไปแล้วโดยผู้ใช้อื่น' })
    }

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        // `02` §10 ไม่มี action `send` — ใช้ `status_change` แล้วระบุปลายทางใน `after` (แนวเดียวกับโมดูลอื่น)
        action: 'status_change',
        targetType: TARGET,
        targetId: batchId,
        before: { status: batch.status, sent_at: null },
        after: { status: 'sent', sent_at: toIso(now), total_satang: batch.totalSatang },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  return getBillingBatch(user, batchId, now)
}

// ── DELETE /api/billing-batches/:id (`19` §10) ──────────────────────────────

/** ลบได้เฉพาะรอบ `draft` — Revenue ที่อยู่ในรอบถูกปล่อยกลับเป็น `ready_for_billing` ครบทุกใบ */
export async function deleteBillingBatch(
  context: RevenueMutationContext,
  batchId: string,
  _input: BillingBatchDeleteInput,
  now: Date = new Date(),
): Promise<{ id: string; revenueIdsReleased: string[] }> {
  const user = context.actor
  const batch = await findBatch(user, batchId)
  assertBillingBatchDeletable(batch.status)

  return prisma.$transaction(async (tx) => {
    const released = await tx.revenue.findMany({
      where: { billingBatchId: batchId, organizationId: user.organizationId },
      select: { id: true },
    })
    const revenueIdsReleased = released.map((row) => row.id)

    await tx.revenue.updateMany({
      where: { billingBatchId: batchId },
      data: { billingBatchId: null, status: 'ready_for_billing', updatedBy: user.id },
    })

    const claimed = await tx.billingBatch.updateMany({
      where: { id: batchId, status: 'draft', deletedAt: null },
      data: { deletedAt: now, updatedBy: user.id },
    })
    if (claimed.count === 0) {
      throw new RevenueError('BILLING_BATCH_INVALID_STATUS', { detail: 'รอบนี้ถูกส่ง/ลบไปแล้วโดยผู้ใช้อื่น' })
    }

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: batchId,
        before: { status: batch.status, period: batch.period, total_satang: batch.totalSatang },
        after: { deleted_at: toIso(now), revenue_ids_released: revenueIdsReleased },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return { id: batchId, revenueIdsReleased }
  })
}

// ── GET /api/ar-aging (`19` §6.4 · `22` §6.11) ──────────────────────────────

export async function getArAging(
  user: SessionUser,
  query: ArAgingQuery,
  now: Date = new Date(),
): Promise<ArAgingReportDto> {
  const asOf = query.asOf ?? toBangkokDateOnly(now)
  const [policy, rows] = await Promise.all([
    getFinancePolicy(user.organizationId),
    prisma.billingBatch.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        // บิลที่ยัง `draft` ยังไม่ได้ส่งให้ลูกค้า ⇒ ยังไม่ใช่ลูกหนี้การค้า (`19` §9.1)
        status: { in: ['sent', 'partially_paid', 'paid'] },
        ...scopeWhere(user, query.companyId),
      },
      select: {
        id: true,
        companyId: true,
        dueDate: true,
        totalSatang: true,
        receivedSatang: true,
        whtWithheldByCustomerSatang: true,
        company: { select: { name: true } },
      },
    }),
  ])

  // Adjustment ที่อนุมัติแล้วของรอบวางบิลเหล่านี้ (`20` §9) — ดึงหลังรู้ id เพื่อไม่ให้ scan ทั้งตาราง
  const adjustmentRows =
    rows.length === 0
      ? []
      : await prisma.adjustment.findMany({
          where: {
            organizationId: user.organizationId,
            status: 'approved',
            billingBatchId: { in: rows.map((row) => row.id) },
          },
          select: { billingBatchId: true, adjustmentType: true, amountSatang: true, status: true },
        })

  const adjustmentsOf = new Map<string, { adjustmentType: AdjustmentType; amountSatang: number; status: AdjustmentStatus }[]>()
  for (const row of adjustmentRows) {
    if (row.billingBatchId === null) continue
    const list = adjustmentsOf.get(row.billingBatchId)
    if (list === undefined) adjustmentsOf.set(row.billingBatchId, [row])
    else list.push(row)
  }

  // WHT ที่ลูกค้าหักไว้ (A1) ถือว่ารับชำระแล้ว (`settledSatang()`) — ไม่งั้นทุกบิลจะค้าง 3% ตลอดกาล
  // ยอดบิลต้องเป็น **ยอดสุทธิหลัง Adjustment** เหมือน KPI ของแดชบอร์ด (`20` §7.1) ไม่งั้นสองตัวเลข
  // บนหน้าเดียวกันไม่ตรงกัน
  const agingRow = (row: (typeof rows)[number]): ArAgingRow => ({
    dueDate: row.dueDate,
    totalSatang: netAfterAdjustments(row.totalSatang, adjustmentsOf.get(row.id) ?? []),
    receivedSatang: row.receivedSatang,
    whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
  })

  const buckets = summarizeArAging(rows.map(agingRow), policy.arAgingBuckets, asOf)

  const byCompany = new Map<string, { name: string; rows: ArAgingRow[] }>()
  for (const row of rows) {
    const bucket = byCompany.get(row.companyId)
    if (bucket === undefined) byCompany.set(row.companyId, { name: row.company.name, rows: [agingRow(row)] })
    else bucket.rows.push(agingRow(row))
  }

  const companies: ArAgingCompanyDto[] = [...byCompany.entries()]
    .map(([companyId, entry]) => {
      const companyBuckets = summarizeArAging(entry.rows, policy.arAgingBuckets, asOf)
      return {
        companyId,
        companyName: entry.name,
        buckets: companyBuckets,
        outstandingSatang: companyBuckets.reduce((sum, item) => sum + item.outstandingSatang, 0),
      }
    })
    .filter((company) => company.outstandingSatang > 0)
    .sort((a, b) => b.outstandingSatang - a.outstandingSatang)

  return {
    asOf: toDateOnlyIso(asOf),
    buckets,
    companies,
    totalOutstandingSatang: buckets.reduce((sum, item) => sum + item.outstandingSatang, 0),
  }
}

// ── จุดเสียบของ Phase 4.2 (ไฟล์ 35 — `19` §9.2) ────────────────────────────

/**
 * **รับชำระจริงเข้ามาจาก Bank Reconciliation เท่านั้น** (`19` §9.2 — ห้ามกรอกมือในไฟล์นี้)
 *
 * รับ "ยอดสะสมที่รับแล้ว" ไม่ใช่ยอดที่เพิ่มขึ้น ⇒ **idempotent**: ยิงซ้ำด้วยค่าเดิมไม่เปลี่ยนอะไร
 * และไม่ลงบันทึกซ้ำ (job/webhook รันซ้ำได้ — `91`) · สถานะใหม่มาจาก
 * `resolveBillingStatusAfterReceipt()` ที่เดียว (`23` §6.8) ห้ามตัดสินเองที่นี่
 */
export async function applyBillingReceipt(input: {
  organizationId: string
  batchId: string
  /** ยอดสะสมที่รับชำระแล้วทั้งหมดของรอบนี้ (สตางค์) */
  receivedSatang: number
  /** A1 — ยอดสะสมที่ลูกค้าหัก ณ ที่จ่ายไว้ (ไม่ระบุ = คงค่าเดิม) */
  whtWithheldByCustomerSatang?: number
  /** ธุรกรรม/เอกสารต้นทาง — ลง audit เพื่อ trace กลับได้ */
  sourceRef: string
  /** ผู้สั่งงาน — `null` = job อัตโนมัติ */
  actorId: string | null
  actorRole: string
}): Promise<{ status: BillingBatchStatus; outstandingSatang: number }> {
  const batch = await prisma.billingBatch.findFirst({
    where: { id: input.batchId, organizationId: input.organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
    },
  })
  if (batch === null) throw new RevenueError('BILLING_BATCH_NOT_FOUND', { detail: `batch=${input.batchId}` })

  const whtSatang = input.whtWithheldByCustomerSatang ?? batch.whtWithheldByCustomerSatang
  const status = resolveBillingStatusAfterReceipt({
    current: batch.status,
    totalSatang: batch.totalSatang,
    receivedSatang: input.receivedSatang,
    whtWithheldByCustomerSatang: whtSatang,
  })

  const unchanged =
    batch.receivedSatang === input.receivedSatang &&
    batch.whtWithheldByCustomerSatang === whtSatang &&
    batch.status === status
  if (unchanged) {
    return {
      status,
      outstandingSatang: arOutstandingSatang({
        totalSatang: batch.totalSatang,
        receivedSatang: batch.receivedSatang,
        whtWithheldByCustomerSatang: batch.whtWithheldByCustomerSatang,
      }),
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.billingBatch.update({
      where: { id: batch.id },
      data: {
        receivedSatang: input.receivedSatang,
        whtWithheldByCustomerSatang: whtSatang,
        status,
        updatedBy: input.actorId,
      },
    })
    await emitAudit(
      {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: 'update',
        targetType: TARGET,
        targetId: batch.id,
        before: {
          status: batch.status,
          received_satang: batch.receivedSatang,
          wht_withheld_by_customer_satang: batch.whtWithheldByCustomerSatang,
        },
        after: {
          status,
          received_satang: input.receivedSatang,
          wht_withheld_by_customer_satang: whtSatang,
          received_source: 'bank_reconciliation',
          source_ref: input.sourceRef,
        },
        reason: `รับชำระจากรายการเดินบัญชี ${input.sourceRef} (ไฟล์ 35)`,
        ipAddress: null,
        userAgent: null,
        diffOnly: false,
      },
      tx,
    )
  })

  return {
    status,
    outstandingSatang: arOutstandingSatang({
      totalSatang: batch.totalSatang,
      receivedSatang: input.receivedSatang,
      whtWithheldByCustomerSatang: whtSatang,
    }),
  }
}
