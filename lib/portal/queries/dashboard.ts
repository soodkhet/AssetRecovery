import { arOutstandingSatang } from '@/lib/finance/ar-calc'
import type { HandoverLotStatus } from '@/lib/generated/prisma/enums'
import { canAccess } from '@/lib/portal/access'
import { documentedBillingAmounts } from '@/lib/portal/documented-amounts'
import type { PortalContext } from '@/lib/portal/guard'
import { countPortalCasesInProgress } from '@/lib/portal/queries/cases'
import { loadPortalDocumentedBatches, PORTAL_VISIBLE_BILLING_STATUSES } from '@/lib/portal/queries/finance'
import { serializePortalDashboard, type PortalDashboardDto, type PortalDashboardSource } from '@/lib/portal/serializers'
import { prisma } from '@/lib/prisma'

/**
 * KPI หน้าภาพรวมของพอร์ทัล (`97` §5 การ์ด 4 ใบ · มติ O43 D9/D12) — **คำนวณสดทุก request** (ไม่ใช้แคชรายงานภายใน)
 *
 * - ทุก query กรอง `organization_id` + `company_id = ctx.companyId`
 * - query ของหมวดที่ผู้เรียกไม่มีสิทธิ์ **ไม่ถูกยิงเลย** และ serializer ตัดการ์ดนั้นออก (ไม่มีคีย์ใน response)
 * - ยอดค้าง: เฉพาะ batch `sent` ขึ้นไป (D9) · **ยอดบิลตามเอกสาร** (ใบกำกับ − ใบลดหนี้ — มติ U14 ไม่ใช่ยอดหลัง
 *   Adjustment ภายใน) · สูตรกลาง `arOutstandingSatang()` (`22` §6.11 — หักภาษีที่ลูกค้าหักแล้ว · O44)
 * - ใบกำกับภาษีล่าสุด: ใบ `active` ล่าสุดตามวันที่ออกของรอบที่ส่งแล้ว (ใบยกเลิกไม่ใช่ "ใบล่าสุด") · ยอด = หน้าใบกำกับ
 * - ล็อตรอส่งมอบ: ล็อตที่ยังไม่ `confirmed`
 */

const PENDING_LOT_STATUSES = ['pending_attach', 'pending_delivery_proof'] as const satisfies readonly HandoverLotStatus[]

async function arOutstandingOf(ctx: PortalContext): Promise<number> {
  const batches = await loadPortalDocumentedBatches(ctx)
  return batches.reduce((sum, batch) => sum + arOutstandingSatang(batch), 0)
}

async function latestTaxInvoiceOf(ctx: PortalContext): Promise<PortalDashboardSource['latestTaxInvoice']> {
  const invoice = await prisma.taxInvoice.findFirst({
    where: {
      organizationId: ctx.user.organizationId,
      status: 'active',
      salesRecord: {
        companyId: ctx.companyId,
        billingBatch: { deletedAt: null, status: { in: [...PORTAL_VISIBLE_BILLING_STATUSES] } },
      },
    },
    orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, invoiceNumber: true, invoiceDate: true },
  })
  if (invoice === null) return null
  const amounts = await documentedBillingAmounts(ctx.user.organizationId, { taxInvoiceId: invoice.id })
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    // ยอดหน้าใบกำกับ (ใบลดหนี้เป็นเอกสารแยก — ไม่หักจากยอดของใบนี้)
    totalSatang: amounts?.invoiced.totalSatang ?? 0,
  }
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
