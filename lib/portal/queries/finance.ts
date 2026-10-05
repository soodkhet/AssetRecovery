import { creditNotesByInvoice } from '@/lib/credit-notes/queries'
import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import type { BillingBatchStatus } from '@/lib/generated/prisma/enums'
import { documentedAmountsForBatches, documentedRevenueAmounts } from '@/lib/portal/documented-amounts'
import type { PortalContext } from '@/lib/portal/guard'
import { portalRevenueMonths } from '@/lib/portal/report-range'
import {
  serializePortalArAging,
  serializePortalBillingBatches,
  serializePortalRevenueSummary,
  serializePortalTaxInvoice,
  type PortalArAgingDto,
  type PortalBillingBatchDto,
  type PortalRevenueSummaryDto,
  type PortalTaxInvoiceDto,
} from '@/lib/portal/serializers'
import { prisma } from '@/lib/prisma'
import { buildArAgingReport } from '@/lib/reports/finance/ar-aging-report'
import { loadRevenueEntries, loadRevenueFailCases } from '@/lib/reports/finance/providers'
import { buildRevenueSummary } from '@/lib/reports/finance/revenue-summary-report'
import { previousReportRange } from '@/lib/reports/range'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'

/**
 * Query ของหมวด **การเงิน** ในพอร์ทัลบริษัทไฟแนนซ์ (`97` §6.2/§6.3/§6.5 · มติ PO 05/10/2569 U6/O43 D7/D9/O44)
 *
 * ### กติกาที่ห้ามหลุด
 * - กรอง `organization_id` + `company_id = ctx.companyId` ทุก query (ค่าจาก session — ไม่รับจาก client)
 * - **รอบวางบิล `draft` ไม่แสดงและไม่นับในยอดใด ๆ** (D9) — ทุก query จำกัด `PORTAL_VISIBLE_BILLING_STATUSES`
 * - **คำนวณสดทุกครั้ง** — ไม่ผ่าน `runReport()`/แคชรายงานภายใน (D9)
 * - **ยอดตามเอกสาร** (มติ PO 05/10/2569 U14): ยอดบิล/AR/กราฟรายได้ใช้ `documentedBillingAmounts()`
 *   (`lib/portal/documented-amounts.ts` — ใบกำกับ − ใบลดหนี้) **ไม่ใช่ยอดหลัง Adjustment ภายใน**
 *   · รายงานภายใน F2/F3 ไม่เปลี่ยน (ยังหลัง Adjustment)
 * - **ไม่มีสูตรเงินที่นี่** — ยอดค้าง = `arOutstandingSatang()` (`22` §6.11 · หัก WHT ที่ลูกค้าหักแล้ว — O44)
 *   ผ่าน serializer · รายงานใช้ builder ตัวเดียวกับ F2/F3 ภายใน (`buildRevenueSummary` / `buildArAgingReport`)
 *   แค่ scope บริษัทเดียว + ป้อนยอดตามเอกสาร
 */

/** สถานะรอบวางบิลที่ฝั่งบริษัทเห็น/นับได้ (`97` §6.2/§10.3) */
export const PORTAL_VISIBLE_BILLING_STATUSES: readonly BillingBatchStatus[] = ['sent', 'partially_paid', 'paid']

const LIST_LIMIT = 200

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function visibleBatchWhere(ctx: PortalContext) {
  return {
    organizationId: ctx.user.organizationId,
    companyId: ctx.companyId,
    deletedAt: null,
    status: { in: [...PORTAL_VISIBLE_BILLING_STATUSES] },
  }
}

// ── GET /api/portal/billing-batches ─────────────────────────────────────────

export async function listPortalBillingBatches(ctx: PortalContext): Promise<PortalBillingBatchDto[]> {
  const rows = await prisma.billingBatch.findMany({
    where: visibleBatchWhere(ctx),
    select: {
      id: true,
      batchNumber: true,
      period: true,
      status: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      dueDate: true,
      sentAt: true,
      // จำนวนเคสในรอบ (มติ U62) = รายการรายได้ที่ผูกรอบนี้ (1 เคส 1 รายการ — trigger idempotent ต่อเคส)
      _count: { select: { revenues: { where: { deletedAt: null } } } },
    },
    orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
    take: LIST_LIMIT,
  })
  const withCounts = rows.map(({ _count, ...row }) => ({ ...row, caseCount: _count.revenues }))
  return serializePortalBillingBatches(await withDocumentedTotals(ctx, withCounts))
}

/** แทน `totalSatang` ดิบของรอบด้วยยอดตามเอกสาร (U14) — รอบที่หาเอกสารไม่เจอคงยอดของรอบ (ยอดที่ส่งบิลจริง) */
async function withDocumentedTotals<T extends { id: string; totalSatang: number }>(
  ctx: PortalContext,
  rows: readonly T[],
): Promise<T[]> {
  const documented = await documentedAmountsForBatches(
    ctx.user.organizationId,
    rows.map((row) => row.id),
  )
  return rows.map((row) => ({ ...row, totalSatang: documented.get(row.id)?.documented.totalSatang ?? row.totalSatang }))
}

/** รอบวางบิลที่บริษัทเห็นได้พร้อมยอดตามเอกสาร — ฐานของการ์ด AR ค้าง (dashboard) และ AR aging */
export async function loadPortalDocumentedBatches(
  ctx: PortalContext,
): Promise<{ id: string; dueDate: Date; totalSatang: number; receivedSatang: number; whtWithheldByCustomerSatang: number }[]> {
  const rows = await prisma.billingBatch.findMany({
    where: visibleBatchWhere(ctx),
    select: { id: true, dueDate: true, totalSatang: true, receivedSatang: true, whtWithheldByCustomerSatang: true },
  })
  return withDocumentedTotals(ctx, rows)
}

// ── GET /api/portal/tax-invoices ────────────────────────────────────────────

export async function listPortalTaxInvoices(ctx: PortalContext): Promise<PortalTaxInvoiceDto[]> {
  const rows = await prisma.taxInvoice.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      salesRecord: { companyId: ctx.companyId, billingBatch: visibleBatchWhere(ctx) },
    },
    // ยอด/รูปแบบการส่ง/ชนิดเอกสารอ่านจาก snapshot บนใบ (มติ PO U95 · U96 #4) — ตัวเดียวกับ PDF
    select: {
      id: true,
      docKind: true,
      invoiceNumber: true,
      invoiceDate: true,
      status: true,
      amountBeforeVatSatang: true,
      vatSatang: true,
      totalSatang: true,
      deliveryFormat: true,
      salesRecord: { select: { billingBatch: { select: { batchNumber: true } } } },
    },
    orderBy: [{ invoiceDate: 'desc' }, { invoiceNumber: 'desc' }],
    take: LIST_LIMIT,
  })
  // ใบลดหนี้ active ของใบที่ผ่าน scope บริษัทแล้วเท่านั้น (คำสั่งเดียว — มติ U14)
  const creditNotes = await creditNotesByInvoice(
    rows.map((row) => row.id),
    { organizationId: ctx.user.organizationId },
  )
  return rows.map((row) =>
    serializePortalTaxInvoice({
      id: row.id,
      docKind: row.docKind,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      status: row.status,
      totalBeforeVatSatang: row.amountBeforeVatSatang,
      vatSatang: row.vatSatang,
      totalSatang: row.totalSatang,
      deliveryFormat: row.deliveryFormat,
      billingBatchNumber: row.salesRecord.billingBatch.batchNumber,
      creditNotes: creditNotes.get(row.id) ?? [],
    }),
  )
}

/**
 * แถวสำหรับยาม `requirePortalRow()` ของการดาวน์โหลดใบกำกับ — **ไม่กรองบริษัท** (ยามเป็นคนตัดสิน + audit)
 * · id ไม่ใช่ uuid / ไม่พบ / รอบวางบิลยังเป็น draft หรือถูกลบ ⇒ `null` (ตอบ 403 แบบเดียวกับ id สุ่ม)
 */
export async function findPortalTaxInvoiceRow(
  ctx: PortalContext,
  invoiceId: string,
): Promise<{ id: string; invoiceNumber: string; companyId: string } | null> {
  if (!UUID_PATTERN.test(invoiceId)) return null
  const row = await prisma.taxInvoice.findFirst({
    where: { id: invoiceId, organizationId: ctx.user.organizationId },
    select: {
      id: true,
      invoiceNumber: true,
      salesRecord: { select: { companyId: true, billingBatch: { select: { status: true, deletedAt: true } } } },
    },
  })
  if (row === null) return null
  const batch = row.salesRecord.billingBatch
  if (batch.deletedAt !== null || !PORTAL_VISIBLE_BILLING_STATUSES.includes(batch.status)) return null
  return { id: row.id, invoiceNumber: row.invoiceNumber, companyId: row.salesRecord.companyId }
}

/**
 * แถวสำหรับยาม `requirePortalRow()` ของการดาวน์โหลด**ใบแจ้งหนี้/ใบวางบิล** (มติ PO U95) — **ไม่กรองบริษัท**
 * (ยามเป็นคนตัดสิน + audit) · id ไม่ใช่ uuid / ไม่พบ / ถูกลบ / ยัง `draft` ⇒ `null` (403 แบบเดียวกับ id สุ่ม)
 */
export async function findPortalBillingBatchRow(
  ctx: PortalContext,
  billingBatchId: string,
): Promise<{ id: string; batchNumber: string; companyId: string } | null> {
  if (!UUID_PATTERN.test(billingBatchId)) return null
  const row = await prisma.billingBatch.findFirst({
    where: { id: billingBatchId, organizationId: ctx.user.organizationId, deletedAt: null },
    select: { id: true, batchNumber: true, companyId: true, status: true },
  })
  if (row === null || !PORTAL_VISIBLE_BILLING_STATUSES.includes(row.status)) return null
  return { id: row.id, batchNumber: row.batchNumber, companyId: row.companyId }
}

// ── GET /api/portal/reports/revenue-summary ─────────────────────────────────

export async function getPortalRevenueSummary(
  ctx: PortalContext,
  options: { months: number; now?: Date },
): Promise<PortalRevenueSummaryDto> {
  const { months, range } = portalRevenueMonths(options.months, options.now ?? new Date())
  const organizationId = ctx.user.organizationId
  const filter = {
    companyId: ctx.companyId,
    billingStatuses: PORTAL_VISIBLE_BILLING_STATUSES,
    // ยอดก่อน VAT ตามเอกสาร (U14) แทนยอดหลัง Adjustment ภายใน
    revenueAmounts: (rows: readonly { billingBatchId: string | null }[]) =>
      documentedRevenueAmounts(
        organizationId,
        rows.flatMap((row) => (row.billingBatchId === null ? [] : [row.billingBatchId])),
      ),
  }
  const [entries, previousEntries, failCases] = await Promise.all([
    loadRevenueEntries(ctx.user.organizationId, 'month', range, null, filter),
    loadRevenueEntries(ctx.user.organizationId, 'month', previousReportRange(range), null, filter),
    // U55 — นิยามเดียวกับ F2 ภายใน: เคสของบริษัทนี้ที่ปิดไม่สำเร็จในเดือนนั้นเข้าตัวหาร % สำเร็จ
    loadRevenueFailCases(ctx.user.organizationId, 'month', range, null, { companyId: ctx.companyId }),
  ])
  const report = buildRevenueSummary({ groupBy: 'month', entries, previousEntries, failCases })
  return serializePortalRevenueSummary({ report, months, rangeStart: range.startDate, rangeEnd: range.endDate })
}

// ── GET /api/portal/reports/ar-aging ────────────────────────────────────────

export async function getPortalArAging(ctx: PortalContext, now: Date = new Date()): Promise<PortalArAgingDto> {
  const asOf = bangkokBusinessDate(now)
  const [policy, batches] = await Promise.all([
    getFinancePolicy(ctx.user.organizationId),
    // เฉพาะ `sent` ขึ้นไป + ยอดตามเอกสาร (U14 — ต่างจาก F3 ภายในที่ใช้ยอดหลัง Adjustment)
    loadPortalDocumentedBatches(ctx),
  ])
  const report = buildArAgingReport({
    companies: batches.length === 0 ? [] : [{ companyId: ctx.companyId, companyName: '', batches }],
    buckets: policy.arAgingBuckets,
    asOf,
  })
  return serializePortalArAging(report, asOf)
}
