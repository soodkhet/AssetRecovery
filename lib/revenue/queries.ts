import { assertPeriodOpenForLabel } from '@/lib/accounting/period-guard'
import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  arOutstandingSatang,
  daysOverdue,
  resolveBankFeeWriteOff,
  summarizeArAging,
  type ArAgingRow,
} from '@/lib/finance/ar-calc'
import { estimateCustomerWhtForBilling } from '@/lib/finance/wht-calc'
import type { Prisma } from '@/lib/generated/prisma/client'
import { adjustmentsAwaitingNotesByBatch, withDocumentedArTotals } from '@/lib/portal/documented-amounts'
import type {
  BillingBatchStatus,
  RevenueStatus,
} from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { billingInvoiceDetailSnapshotJson, billingPartySnapshotOf } from '@/lib/revenue/billing-invoice'
import { sellerProfileOf, sellerProfileSnapshotJson } from '@/lib/organization/profile'
import { loadReceivingAccount } from '@/lib/revenue/billing-invoice-queries'
import { loadDocumentTemplateSnapshot } from '@/lib/settings/queries/tax-doc-templates'
import { documentTemplateSnapshotJson } from '@/lib/settings/tax-doc-template'
import { RevenueError } from '@/lib/revenue/errors'
import { syncSalesRecordFromBilling } from '@/lib/sales/queries'
import {
  assertBillingBatchDeletable,
  assertBillingBatchSendable,
  assertHasRevenueToBill,
  assertNoOpenDraftBatch,
  assertRevenueEditable,
  billableRevenueDateFilter,
  billingPeriodLabel,
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
import { cycleCoversCompany, resolveDueDate } from '@/lib/settings/cycles'
import { loadActiveCycleForScope, resolveCompanyBillingCycle } from '@/lib/settings/queries/cycles'
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
 * - **หลายรอบวางบิลต่อบริษัทต่อเดือนได้** (มติ PO U86 · BUG-155 — `19` §6.2 v2.5) — รอบใหม่ดึงรายได้
 *   ที่ยังไม่เคยวางบิลทั้งหมดของบริษัทที่ `revenue_date ≤ วันตัดรอบ` (รวมค้างจากเดือนก่อน) · ไม่ซ้ำกับรอบอื่น
 *   ด้วย 1:1 `revenues.billing_batch_id` (ยึดเฉพาะใบที่ยังว่าง) + ล็อกแถวบริษัท `FOR UPDATE` ต่อคิวการสร้าง
 *   · ห้ามมีรอบ**ร่าง**ซ้อนของบริษัทเดียวกัน (ต้องส่งหรือลบรอบร่างเดิมก่อน)
 * - **ยอดรวมของรอบมาจาก `summarizeBillingBatch()`** (pure) ห้ามบวกเองที่นี่ ·
 *   ยอดค้างจาก `arOutstandingSatang()` (`22` §6.11) · ช่วงอายุหนี้จาก `finance_policy_settings`
 * - **`received_amount` ห้ามกรอกมือ** (`19` §9.2) — อัปเดตผ่าน `applyBillingReceipt()` ที่ไฟล์ 35
 *   (Phase 4.2) เรียกเท่านั้น
 * - scope ระดับแถว: Company User เห็นเฉพาะบริษัทตัวเอง (`25` §7 — ไม่ leak ข้ามบริษัท)
 */

export { MANAGE_BILLING } from '@/lib/revenue/revenue'

/**
 * capability ที่เปิดประตูเข้า endpoint อ่าน (`19` §12) — ขอบเขตแถวบังคับซ้ำที่ `*ScopeWhere()`
 * ถอด `view_own_company_data` แล้ว (มติ PO 05/10/2569 U6/O43 D2 — ผู้ใช้บริษัทดูยอดผ่านพอร์ทัล `portal_finance`)
 */
export const BILLING_READ_CAPABILITIES = ['manage_billing'] as const

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
  vatModeSnapshot: true,
  grossSatang: true,
  vatSatang: true,
  vatRatePctUsed: true,
  totalSatang: true,
  status: true,
  billingBatchId: true,
  createdAt: true,
  case: { select: { caseRef: true, debtorName: true } },
  company: { select: { name: true } },
  billingBatch: { select: { period: true, batchNumber: true } },
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
    vatModeSnapshot: row.vatModeSnapshot,
    grossSatang: row.grossSatang,
    vatSatang: row.vatSatang,
    vatRatePctUsed: row.vatRatePctUsed.toNumber(),
    totalSatang: row.totalSatang,
    status: row.status,
    billingBatchId: row.billingBatchId,
    billingBatchPeriod: row.billingBatch?.period ?? null,
    billingBatchNumber: row.billingBatch?.batchNumber ?? null,
    createdAt: toIso(row.createdAt),
  }
}

const batchSelect = {
  id: true,
  companyId: true,
  batchNumber: true,
  period: true,
  status: true,
  totalSatang: true,
  receivedSatang: true,
  whtWithheldByCustomerSatang: true,
  bankFeeWrittenOffSatang: true,
  bankFeeWrittenOffDate: true,
  dueDate: true,
  sentAt: true,
  createdAt: true,
  company: { select: { name: true, whtWithheldByCustomerPct: true } },
  createdByUser: { select: { fullName: true } },
  _count: { select: { revenues: true } },
  // UAT Q6 — ป้าย VAT ของรอบอ่านจาก snapshot ของรายได้ในรอบ ไม่ใช่ค่าปัจจุบันของบริษัท
  revenues: { select: { vatModeSnapshot: true }, distinct: 'vatModeSnapshot', orderBy: { vatModeSnapshot: 'asc' } },
} as const

type BatchRow = Prisma.BillingBatchGetPayload<{ select: typeof batchSelect }>

/**
 * BUG-178 — ยอดค้าง (AR) ของแถว/การ์ดหน้า "รายได้และวางบิล" ต้องเป็น**ยอดตามเอกสาร** (ใบแจ้งหนี้ − ใบลดหนี้ +
 * ใบเพิ่มหนี้ · มติ PO U96 #11) นิยามเดียวกับ AR Aging / F3 / พอร์ทัล ⇒ `arTotalSatang` มาจาก
 * `withDocumentedArTotals()` ตัวเดียวกัน · `totalSatang` ของ DTO ยังเป็นยอดใบวางบิลที่ส่งจริง (ไม่เปลี่ยน)
 */
async function documentedArTotals(
  organizationId: string,
  rows: readonly { id: string; totalSatang: number }[],
): Promise<Map<string, number>> {
  const documented = await withDocumentedArTotals(
    organizationId,
    rows.map((row) => ({ id: row.id, totalSatang: row.totalSatang })),
  )
  return new Map(documented.map((row) => [row.id, row.totalSatang]))
}

function toBatchDto(
  row: BatchRow,
  asOf: Date,
  amountBeforeVatSatang: number,
  arTotalSatang: number = row.totalSatang,
): BillingBatchDto {
  const customerWhtPct =
    row.company.whtWithheldByCustomerPct === null ? null : row.company.whtWithheldByCustomerPct.toNumber()
  const customerWht = estimateCustomerWhtForBilling({
    amountBeforeVatSatang,
    totalSatang: row.totalSatang,
    recordedWhtSatang: row.whtWithheldByCustomerSatang,
    whtPct: customerWhtPct,
  })
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    vatModes: row.revenues.map((revenue) => revenue.vatModeSnapshot),
    batchNumber: row.batchNumber,
    period: row.period,
    status: row.status,
    totalSatang: row.totalSatang,
    receivedSatang: row.receivedSatang,
    whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    bankFeeWrittenOffSatang: row.bankFeeWrittenOffSatang,
    bankFeeWrittenOffDate: row.bankFeeWrittenOffDate === null ? null : toDateOnlyIso(row.bankFeeWrittenOffDate),
    outstandingSatang: arOutstandingSatang({
      totalSatang: arTotalSatang,
      receivedSatang: row.receivedSatang,
      whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
      bankFeeWrittenOffSatang: row.bankFeeWrittenOffSatang,
    }),
    amountBeforeVatSatang,
    customerWhtPct,
    customerWhtSatang: customerWht.whtSatang,
    customerWhtIsEstimate: customerWht.isEstimate,
    expectedReceiptSatang: customerWht.expectedReceiptSatang,
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
  const [grossByBatch, arTotals] = await Promise.all([
    batchGrossSatang(
      user.organizationId,
      rows.map((row) => row.id),
    ),
    documentedArTotals(user.organizationId, rows),
  ])
  return rows.map((row) => toBatchDto(row, now, grossByBatch.get(row.id) ?? 0, arTotals.get(row.id)))
}

/** ยอดก่อน VAT ต่อรอบ (ผลรวมรายได้ที่ยังไม่ถูกลบ) — query เดียวทั้งหน้า */
async function batchGrossSatang(organizationId: string, batchIds: readonly string[]): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map()
  const groups = await prisma.revenue.groupBy({
    by: ['billingBatchId'],
    where: { organizationId, deletedAt: null, billingBatchId: { in: [...batchIds] } },
    _sum: { grossSatang: true },
  })
  return new Map(
    groups.flatMap((group) =>
      group.billingBatchId === null ? [] : [[group.billingBatchId, group._sum.grossSatang ?? 0] as const],
    ),
  )
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
  const gross = revenues.reduce((sum, revenue) => sum + revenue.grossSatang, 0)
  const arTotals = await documentedArTotals(user.organizationId, [batch])
  return { ...toBatchDto(batch, now, gross, arTotals.get(batch.id)), revenues: revenues.map(toRevenueDto) }
}

// ── POST /api/billing-batches (`19` §9.1) ───────────────────────────────────

/**
 * วันครบกำหนดชำระ (`19` §7.2) — มติ PO U146: **รอบบิล (`13` §6.1) เป็นแหล่งเดียว** ของวันตัดรอบ + เครดิตเทอม
 * · ไม่ระบุรอบ ⇒ รอบบิลที่ครอบบริษัทนั้น (เลือกจากหน้าบริษัท / รอบ "ทุกบริษัท") · ไม่มีรอบเลย = `BILLING_CYCLE_NOT_SET`
 *   (เดิมใช้ `finance_companies.payment_due_days` — คอลัมน์ถูกตัดแล้ว ค่าเดิมแปลงเป็นรอบบิลใน migration)
 * · ระบุรอบ ⇒ ต้องครอบบริษัทนั้น (มติ PO U133) ไม่ครอบ = `CYCLE_SCOPE_MISMATCH`
 */
async function resolveBatchDueDate(input: {
  organizationId: string
  companyId: string
  cycleId: string | null
  cutoffDate: Date
}): Promise<{ dueDate: Date; source: string }> {
  if (input.cycleId === null) {
    const own = await resolveCompanyBillingCycle(input.organizationId, input.companyId)
    if (own === null) throw new SettingsError('BILLING_CYCLE_NOT_SET', { detail: `company=${input.companyId}` })
    return {
      dueDate: resolveDueDate(input.cutoffDate, own),
      source: `cycle=${own.name} (${own.dueRuleType}${own.dueRuleValue === null ? '' : ` ${own.dueRuleValue}`})`,
    }
  }

  const cycle = await loadActiveCycleForScope(input.organizationId, input.cycleId, 'AR')
  if (!cycleCoversCompany(cycle, input.companyId)) {
    throw new SettingsError('CYCLE_SCOPE_MISMATCH', { detail: `cycle=${cycle.id} company=${input.companyId}` })
  }

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
    select: { id: true, name: true },
  })
  if (company === null) throw new FinanceCompanyError('COMPANY_NOT_FOUND', { detail: `company=${input.companyId}` })

  const period = billingPeriodLabel(input.cutoffDate)

  // Period Lock (`13` §6.11 · Phase 4.1) — งวดที่ปิดแล้วห้ามสร้างรอบวางบิลย้อนหลัง ต้องใช้ Adjustment
  await assertPeriodOpenForLabel({
    organizationId: user.organizationId,
    periodLabel: period,
    targetType: 'billing_batches',
  })

  const { dueDate, source } = await resolveBatchDueDate({
    organizationId: user.organizationId,
    companyId: company.id,
    cycleId: input.cycleId,
    cutoffDate: input.cutoffDate,
  })

  const batchId = await prisma.$transaction(async (tx) => {
    // ต่อคิวการสร้างรอบของบริษัทเดียวกัน (มติ U86) — สองคนกดพร้อมกัน คนที่สองรอจนคนแรก commit
    // แล้วเห็นรอบร่างของคนแรก ⇒ ได้ข้อความ "มีรอบร่างค้าง" แทนการแย่งรายได้ชุดเดียวกัน
    await tx.$queryRaw`SELECT id FROM finance_companies WHERE id = ${company.id}::uuid FOR UPDATE`

    const openDraft = await tx.billingBatch.findFirst({
      where: { organizationId: user.organizationId, companyId: company.id, status: 'draft', deletedAt: null },
      select: { id: true, batchNumber: true, period: true },
      orderBy: { createdAt: 'asc' },
    })
    assertNoOpenDraftBatch(openDraft, company.name)

    // รายได้ที่ยังไม่เคยวางบิลทั้งหมดของบริษัทถึงวันตัดรอบ (รวมค้างจากเดือนก่อน — มติ U86)
    // ยึดเฉพาะใบที่ยังไม่ผูกรอบใด (1:1 — กันสองรอบแย่งใบเดียวกัน)
    const candidates = await tx.revenue.findMany({
      where: {
        organizationId: user.organizationId,
        companyId: company.id,
        deletedAt: null,
        status: 'ready_for_billing',
        billingBatchId: null,
        revenueDate: billableRevenueDateFilter(input.cutoffDate),
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
        // ไม่ส่ง `batchNumber` — DB trigger เดินเลข `BL-<พ.ศ.>-NNN` ให้ภายใต้ล็อกแถวองค์กร (มติ U76)
      },
      select: { id: true, batchNumber: true },
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
          batch_number: batch.batchNumber,
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
  await assertPeriodOpenForLabel({
    organizationId: user.organizationId,
    periodLabel: batch.period,
    targetType: 'billing_batches',
    targetId: batchId,
  })

  await prisma.$transaction(async (tx) => {
    // UAT BUG-164 — snapshot ผู้ขาย/ผู้ซื้อของใบแจ้งหนี้ ณ วันส่ง (ใบที่ส่งแล้วไม่เปลี่ยนตามการแก้ข้อมูลภายหลัง)
    const parties = await tx.billingBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: {
        organization: {
          select: {
            name: true,
            taxId: true,
            address: true,
            phone: true,
            branchCode: true,
            nameEn: true,
            email: true,
            website: true,
            logoUrl: true,
            logoSha256: true,
          },
        },
        company: {
          select: { name: true, taxId: true, address: true, phone: true, branchCode: true, whtWithheldByCustomerPct: true },
        },
        revenues: {
          where: { deletedAt: null },
          select: {
            id: true,
            case: {
              select: {
                assetDescription: true,
                assets: {
                  where: { deletedAt: null, lotId: { not: null } },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { lot: { select: { docRef: true } } },
                },
              },
            },
          },
        },
      },
    })
    // มติ PO 07/10/2569 U130 — % ภาษีที่ลูกค้าหัก + บัญชีรับเงิน + รายละเอียดทรัพย์ ณ วันส่ง (พิมพ์ซ้ำได้ตัวเลขเดิม)
    const invoiceDetailSnapshot = billingInvoiceDetailSnapshotJson({
      customerWhtPct:
        parties.company.whtWithheldByCustomerPct === null ? null : parties.company.whtWithheldByCustomerPct.toFixed(2),
      receivingAccount: await loadReceivingAccount(user.organizationId, tx),
      lines: parties.revenues.map((revenue) => ({
        revenueId: revenue.id,
        assetDescription: revenue.case.assetDescription,
        handoverDocRef: revenue.case.assets[0]?.lot?.docRef ?? null,
      })),
    })
    // มติ PO U122 — ข้อความท้าย + รูปลายเซ็นของใบแจ้งหนี้ ณ วันส่ง
    const documentTemplate = await loadDocumentTemplateSnapshot(tx, user.organizationId, 'billing_invoice')
    const snapshot = {
      ...billingPartySnapshotOf(parties.organization, parties.company),
      documentTemplateSnapshot: documentTemplateSnapshotJson(documentTemplate),
      // มติ PO U99 — หัวเอกสาร (ชื่ออังกฤษ/อีเมล/เว็บไซต์/โลโก้) ณ วันส่ง
      sellerProfileSnapshot: sellerProfileSnapshotJson(sellerProfileOf(parties.organization)),
      invoiceDetailSnapshot,
    }
    // ยึดด้วยสถานะเดิม — สองคนกดส่งพร้อมกัน คนที่สองได้ 0 แถวแล้วโดนปฏิเสธ (ไม่ทับ `sent_at`)
    const claimed = await tx.billingBatch.updateMany({
      where: { id: batchId, status: 'draft' },
      data: { status: 'sent', sentAt: now, sentBy: user.id, updatedBy: user.id, ...snapshot },
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
        after: {
          status: 'sent',
          sent_at: toIso(now),
          total_satang: batch.totalSatang,
          buyer_name: snapshot.buyerName,
          buyer_tax_id: snapshot.buyerTaxId,
          seller_name: snapshot.sellerName,
        },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  // จุดเสียบของบัญชี (`31` §6.1 · §9.1) — อยู่นอก transaction เพราะเป็น **idempotent** เรียกซ้ำได้
  // ถ้าครั้งนี้พลาด และไม่ควรทำให้การส่งบิลที่สำเร็จแล้วถูก rollback ตาม (แนวเดียวกับจุดเสียบของ 4.2)
  await syncSalesRecordFromBilling({ actor: user, meta: context.meta }, batchId)

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
  await assertPeriodOpenForLabel({
    organizationId: user.organizationId,
    periodLabel: batch.period,
    targetType: 'billing_batches',
    targetId: batchId,
  })

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
  const [policy, rawRows] = await Promise.all([
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
        bankFeeWrittenOffSatang: true,
        company: { select: { name: true } },
      },
    }),
  ])

  // มติ PO U96 #11 — ยอดลูกหนี้ภายใน = **ยอดตามเอกสาร** (ใบแจ้งหนี้ − ใบลดหนี้ + ใบเพิ่มหนี้) นิยามเดียวกับพอร์ทัล
  // (helper ตัวเดียวกัน) · Adjustment ที่ยังไม่มีเอกสารไม่สะท้อนยอด แต่นับเป็นป้าย "รอใบลดหนี้/ใบเพิ่มหนี้"
  // · WHT ที่ลูกค้าหักไว้ (A1) ถือว่ารับชำระแล้ว (`arOutstandingSatang()`)
  const [rows, awaitingNotes] = await Promise.all([
    withDocumentedArTotals(user.organizationId, rawRows),
    adjustmentsAwaitingNotesByBatch(
      user.organizationId,
      rawRows.map((row) => row.id),
    ),
  ])
  const agingRow = (row: (typeof rows)[number]): ArAgingRow => ({
    dueDate: row.dueDate,
    totalSatang: row.totalSatang,
    receivedSatang: row.receivedSatang,
    whtWithheldByCustomerSatang: row.whtWithheldByCustomerSatang,
    bankFeeWrittenOffSatang: row.bankFeeWrittenOffSatang,
  })

  const buckets = summarizeArAging(rows.map(agingRow), policy.arAgingBuckets, asOf)

  const byCompany = new Map<string, { name: string; rows: ArAgingRow[]; awaiting: number }>()
  for (const row of rows) {
    const awaiting = awaitingNotes.get(row.id) ?? 0
    const bucket = byCompany.get(row.companyId)
    if (bucket === undefined) byCompany.set(row.companyId, { name: row.company.name, rows: [agingRow(row)], awaiting })
    else {
      bucket.rows.push(agingRow(row))
      bucket.awaiting += awaiting
    }
  }

  const companies: ArAgingCompanyDto[] = [...byCompany.entries()]
    .map(([companyId, entry]) => {
      const companyBuckets = summarizeArAging(entry.rows, policy.arAgingBuckets, asOf)
      return {
        companyId,
        companyName: entry.name,
        buckets: companyBuckets,
        outstandingSatang: companyBuckets.reduce((sum, item) => sum + item.outstandingSatang, 0),
        awaitingNoteAdjustmentCount: entry.awaiting,
      }
    })
    .filter((company) => company.outstandingSatang > 0 || company.awaitingNoteAdjustmentCount > 0)
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
/**
 * ⚠️ **ไม่มี Period Lock guard ที่นี่โดยตั้งใจ** (Phase 4.1) — การรับชำระเป็น "เหตุการณ์ใหม่ของงวด
 * ปัจจุบัน" ที่ไปอัปเดตยอดคงค้างของรอบเก่า ไม่ใช่การแก้ยอดที่ปิดงวดไปแล้ว (`19` §9.2 · `35`)
 * ถ้าบล็อกที่นี่ = กระทบยอดธนาคารของเดือนปัจจุบันจะจับคู่บิลเก่าไม่ได้เลย
 */
export async function applyBillingReceipt(input: {
  organizationId: string
  batchId: string
  /** ยอดสะสมที่รับชำระแล้วทั้งหมดของรอบนี้ (สตางค์) */
  receivedSatang: number
  /** A1 — ยอดสะสมที่ลูกค้าหัก ณ ที่จ่ายไว้ (ไม่ระบุ = คงค่าเดิม) */
  whtWithheldByCustomerSatang?: number
  /**
   * มติ PO U144 — วันรับเงินล่าสุดของรอบ (date-only) ใช้เป็นวันที่ตัดส่วนต่างค่าธรรมเนียม ·
   * ไม่ระบุ = วันนี้ตามเวลาไทย
   */
  lastReceivedDate?: Date | null
  /** ธุรกรรม/เอกสารต้นทาง — ลง audit เพื่อ trace กลับได้ */
  sourceRef: string
  /** ผู้สั่งงาน — `null` = job อัตโนมัติ */
  actorId: string | null
  actorRole: string
  now?: Date
}): Promise<{ status: BillingBatchStatus; outstandingSatang: number; bankFeeWrittenOffSatang: number }> {
  const batch = await prisma.billingBatch.findFirst({
    where: { id: input.batchId, organizationId: input.organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      bankFeeWrittenOffSatang: true,
      bankFeeWrittenOffDate: true,
    },
  })
  if (batch === null) throw new RevenueError('BILLING_BATCH_NOT_FOUND', { detail: `batch=${input.batchId}` })

  const whtSatang = input.whtWithheldByCustomerSatang ?? batch.whtWithheldByCustomerSatang
  // มติ PO U144 — ขาดไม่เกินเพดาน ⇒ ส่วนต่างเป็นค่าธรรมเนียมธนาคาร (คำนวณใหม่จากยอดสะสมทุกครั้ง · ไม่สะสมทับ)
  const policy = await getFinancePolicy(input.organizationId)
  const bankFeeSatang = resolveBankFeeWriteOff({
    totalSatang: batch.totalSatang,
    receivedSatang: input.receivedSatang,
    whtWithheldByCustomerSatang: whtSatang,
    toleranceSatang: policy.writeOffToleranceSatang,
  })
  // ยอดตัดเท่าเดิม ⇒ คงวันที่เดิม (ยิงซ้ำไม่ขยับวัน) · ยอดเปลี่ยน ⇒ วันรับเงินล่าสุด
  const bankFeeDate =
    bankFeeSatang === 0
      ? null
      : bankFeeSatang === batch.bankFeeWrittenOffSatang && batch.bankFeeWrittenOffDate !== null
        ? batch.bankFeeWrittenOffDate
        : (input.lastReceivedDate ?? toBangkokDateOnly(input.now ?? new Date()))
  const status = resolveBillingStatusAfterReceipt({
    current: batch.status,
    totalSatang: batch.totalSatang,
    receivedSatang: input.receivedSatang,
    whtWithheldByCustomerSatang: whtSatang,
    bankFeeWrittenOffSatang: bankFeeSatang,
  })

  const unchanged =
    batch.receivedSatang === input.receivedSatang &&
    batch.whtWithheldByCustomerSatang === whtSatang &&
    batch.bankFeeWrittenOffSatang === bankFeeSatang &&
    batch.status === status
  if (unchanged) {
    return {
      status,
      bankFeeWrittenOffSatang: bankFeeSatang,
      outstandingSatang: arOutstandingSatang({
        totalSatang: batch.totalSatang,
        receivedSatang: batch.receivedSatang,
        whtWithheldByCustomerSatang: batch.whtWithheldByCustomerSatang,
        bankFeeWrittenOffSatang: batch.bankFeeWrittenOffSatang,
      }),
    }
  }

  const bankFeeChanged = batch.bankFeeWrittenOffSatang !== bankFeeSatang
  await prisma.$transaction(async (tx) => {
    await tx.billingBatch.update({
      where: { id: batch.id },
      data: {
        receivedSatang: input.receivedSatang,
        whtWithheldByCustomerSatang: whtSatang,
        bankFeeWrittenOffSatang: bankFeeSatang,
        bankFeeWrittenOffDate: bankFeeDate,
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
          bank_fee_written_off_satang: batch.bankFeeWrittenOffSatang,
          bank_fee_written_off_date: batch.bankFeeWrittenOffDate === null ? null : toDateOnlyIso(batch.bankFeeWrittenOffDate),
        },
        after: {
          status,
          received_satang: input.receivedSatang,
          wht_withheld_by_customer_satang: whtSatang,
          bank_fee_written_off_satang: bankFeeSatang,
          bank_fee_written_off_date: bankFeeDate === null ? null : toDateOnlyIso(bankFeeDate),
          // เพดานที่ใช้ตัดสิน ณ ตอนนั้น (snapshot ใน audit — ค่าตั้งเปลี่ยนภายหลังไม่ย้อนแก้)
          ...(bankFeeChanged ? { write_off_tolerance_satang: policy.writeOffToleranceSatang } : {}),
          received_source: 'bank_reconciliation',
          source_ref: input.sourceRef,
        },
        reason:
          bankFeeChanged && bankFeeSatang > 0
            ? `รับชำระจากรายการเดินบัญชี ${input.sourceRef} · ตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร ${(bankFeeSatang / 100).toFixed(2)} บาท (ไม่เกินเพดาน)`
            : `รับชำระจากรายการเดินบัญชี ${input.sourceRef}`,
        ipAddress: null,
        userAgent: null,
        diffOnly: false,
      },
      tx,
    )
  })

  return {
    status,
    bankFeeWrittenOffSatang: bankFeeSatang,
    outstandingSatang: arOutstandingSatang({
      totalSatang: batch.totalSatang,
      receivedSatang: input.receivedSatang,
      whtWithheldByCustomerSatang: whtSatang,
      bankFeeWrittenOffSatang: bankFeeSatang,
    }),
  }
}
