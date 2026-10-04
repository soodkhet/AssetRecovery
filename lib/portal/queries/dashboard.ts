import { arOutstandingSatang } from '@/lib/finance/ar-calc'
import type { BillingBatchStatus, HandoverLotStatus } from '@/lib/generated/prisma/enums'
import { canAccess } from '@/lib/portal/access'
import type { PortalContext } from '@/lib/portal/guard'
import { countPortalCasesInProgress } from '@/lib/portal/queries/cases'
import { serializePortalDashboard, type PortalDashboardDto, type PortalDashboardSource } from '@/lib/portal/serializers'
import { prisma } from '@/lib/prisma'

/**
 * KPI หน้าภาพรวมของพอร์ทัล (`97` §5 การ์ด 4 ใบ · มติ O43 D9/D12) — **คำนวณสดทุก request** (ไม่ใช้แคชรายงานภายใน)
 *
 * - ทุก query กรอง `organization_id` + `company_id = ctx.companyId`
 * - query ของหมวดที่ผู้เรียกไม่มีสิทธิ์ **ไม่ถูกยิงเลย** และ serializer ตัดการ์ดนั้นออก (ไม่มีคีย์ใน response)
 * - ยอดค้าง: เฉพาะ batch `sent` ขึ้นไป (D9) · สูตรกลาง `arOutstandingSatang()` (`22` §6.11 — หักภาษีที่ลูกค้าหักแล้ว · O44)
 * - ใบกำกับภาษีล่าสุด: ใบ `active` ล่าสุดตามวันที่ออก (ใบยกเลิกไม่ใช่ "ใบล่าสุด" ที่บริษัทต้องใช้)
 * - ล็อตรอส่งมอบ: ล็อตที่ยังไม่ `confirmed`
 */

const BILLED_STATUSES = ['sent', 'partially_paid', 'paid'] as const satisfies readonly BillingBatchStatus[]
const PENDING_LOT_STATUSES = ['pending_attach', 'pending_delivery_proof'] as const satisfies readonly HandoverLotStatus[]

async function arOutstandingOf(ctx: PortalContext): Promise<number> {
  const batches = await prisma.billingBatch.findMany({
    where: {
      organizationId: ctx.user.organizationId,
      companyId: ctx.companyId,
      deletedAt: null,
      status: { in: [...BILLED_STATUSES] },
    },
    select: { totalSatang: true, receivedSatang: true, whtWithheldByCustomerSatang: true },
  })
  return batches.reduce((sum, batch) => sum + arOutstandingSatang(batch), 0)
}

async function latestTaxInvoiceOf(ctx: PortalContext): Promise<PortalDashboardSource['latestTaxInvoice']> {
  const invoice = await prisma.taxInvoice.findFirst({
    where: {
      organizationId: ctx.user.organizationId,
      status: 'active',
      salesRecord: { companyId: ctx.companyId },
    },
    orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    select: { invoiceNumber: true, invoiceDate: true, salesRecord: { select: { totalSatang: true } } },
  })
  if (invoice === null) return null
  return { invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.invoiceDate, totalSatang: invoice.salesRecord.totalSatang }
}

async function pendingLotCountOf(ctx: PortalContext): Promise<number> {
  return prisma.handoverLot.count({
    where: {
      organizationId: ctx.user.organizationId,
      companyId: ctx.companyId,
      deletedAt: null,
      status: { in: [...PENDING_LOT_STATUSES] },
    },
  })
}

export async function getPortalDashboard(ctx: PortalContext): Promise<PortalDashboardDto> {
  const caps = ctx.capabilities
  const finance = canAccess('finance', caps)
  const handover = canAccess('handover', caps)
  const [inProgressCaseCount, outstanding, latestTaxInvoice, pendingLotCount] = await Promise.all([
    canAccess('cases', caps) ? countPortalCasesInProgress(ctx) : Promise.resolve(0),
    finance ? arOutstandingOf(ctx) : Promise.resolve(0),
    finance ? latestTaxInvoiceOf(ctx) : Promise.resolve(null),
    handover ? pendingLotCountOf(ctx) : Promise.resolve(0),
  ])
  return serializePortalDashboard(
    { inProgressCaseCount, arOutstandingSatang: outstanding, latestTaxInvoice, pendingLotCount },
    caps,
  )
}
