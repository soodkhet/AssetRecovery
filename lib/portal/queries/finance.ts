import { bangkokBusinessDate } from '@/lib/field/expense-queries'
import type { BillingBatchStatus } from '@/lib/generated/prisma/enums'
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
import { loadArAgingCompanies, loadRevenueEntries } from '@/lib/reports/finance/providers'
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
 * - **ไม่มีสูตรเงินที่นี่** — ยอดค้าง = `arOutstandingSatang()` (`22` §6.11 · หัก WHT ที่ลูกค้าหักแล้ว — O44)
 *   ผ่าน serializer · รายงานใช้ loader + builder ตัวเดียวกับ F2/F3 ภายใน (`loadRevenueEntries` /
 *   `buildRevenueSummary` · `loadArAgingCompanies` / `buildArAgingReport`) แค่ scope บริษัทเดียว
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
      period: true,
      status: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      dueDate: true,
      sentAt: true,
    },
    orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
    take: LIST_LIMIT,
  })
  return serializePortalBillingBatches(rows)
}

// ── GET /api/portal/tax-invoices ────────────────────────────────────────────

export async function listPortalTaxInvoices(ctx: PortalContext): Promise<PortalTaxInvoiceDto[]> {
  const [rows, company] = await Promise.all([
    prisma.taxInvoice.findMany({
      where: {
        organizationId: ctx.user.organizationId,
        salesRecord: { companyId: ctx.companyId, billingBatch: visibleBatchWhere(ctx) },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        status: true,
        salesRecord: { select: { totalSatang: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { invoiceNumber: 'desc' }],
      take: LIST_LIMIT,
    }),
    // `02` ไม่มีรูปแบบการส่งต่อใบ ⇒ ค่าเริ่มต้นของบริษัท (ตัวเดียวกับ PDF ภายใน — `getTaxInvoiceDocSource`)
    prisma.financeCompany.findFirst({
      where: { id: ctx.companyId, organizationId: ctx.user.organizationId },
      select: { defaultInvoiceDeliveryFormat: true },
    }),
  ])
  if (company === null) return []
  return rows.map((row) =>
    serializePortalTaxInvoice({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      status: row.status,
      totalSatang: row.salesRecord.totalSatang,
      deliveryFormat: company.defaultInvoiceDeliveryFormat,
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

// ── GET /api/portal/reports/revenue-summary ─────────────────────────────────

export async function getPortalRevenueSummary(
  ctx: PortalContext,
  options: { months: number; now?: Date },
): Promise<PortalRevenueSummaryDto> {
  const { months, range } = portalRevenueMonths(options.months, options.now ?? new Date())
  const filter = { companyId: ctx.companyId, billingStatuses: PORTAL_VISIBLE_BILLING_STATUSES }
  const [entries, previousEntries] = await Promise.all([
    loadRevenueEntries(ctx.user.organizationId, 'month', range, null, filter),
    loadRevenueEntries(ctx.user.organizationId, 'month', previousReportRange(range), null, filter),
  ])
  const report = buildRevenueSummary({ groupBy: 'month', entries, previousEntries })
  return serializePortalRevenueSummary({ report, months, rangeStart: range.startDate, rangeEnd: range.endDate })
}

// ── GET /api/portal/reports/ar-aging ────────────────────────────────────────

export async function getPortalArAging(ctx: PortalContext, now: Date = new Date()): Promise<PortalArAgingDto> {
  const asOf = bangkokBusinessDate(now)
  const [policy, companies] = await Promise.all([
    getFinancePolicy(ctx.user.organizationId),
    // `loadArAgingCompanies` นับเฉพาะ `sent` ขึ้นไปอยู่แล้ว + ยอดหลัง Adjustment — ชุดเดียวกับ F3/E1 ภายใน
    loadArAgingCompanies(ctx.user.organizationId, { companyId: ctx.companyId }),
  ])
  const report = buildArAgingReport({
    companies: companies.filter((company) => company.companyId === ctx.companyId),
    buckets: policy.arAgingBuckets,
    asOf,
  })
  return serializePortalArAging(report, asOf)
}
