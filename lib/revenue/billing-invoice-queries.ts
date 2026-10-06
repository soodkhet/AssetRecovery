import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'
import { parseSellerProfileSnapshot } from '@/lib/organization/profile'
import { billingInvoicePartiesOf, type BillingInvoiceSource } from '@/lib/revenue/billing-invoice'
import { RevenueError } from '@/lib/revenue/errors'

/**
 * ข้อมูลดิบของ **ใบแจ้งหนี้/ใบวางบิล** (มติ PO U95) — ใช้ร่วม route ภายในและพอร์ทัล (เอกสารเดียวกันทุกตัวอักษร)
 *
 * - รอบ `draft` ยังไม่ได้ส่งให้ลูกค้า ⇒ ยังไม่มีใบแจ้งหนี้ (`BILLING_BATCH_INVALID_STATUS`)
 * - scope: Company User เห็นเฉพาะบริษัทตัวเอง · นอก scope = 404 แบบไม่ leak (`BILLING_BATCH_NOT_FOUND`)
 * - ผู้ขาย/ผู้ซื้อ = **snapshot ตอนส่งรอบวางบิล** (UAT BUG-164) — แก้ชื่อ/ที่อยู่บริษัทภายหลัง ใบที่ส่งแล้วไม่เปลี่ยน
 */
export async function getBillingInvoiceSource(user: SessionUser, billingBatchId: string): Promise<BillingInvoiceSource> {
  const scope = user.scope
  const companyFilter =
    scope.kind === 'global' ? {} : scope.kind === 'company' && scope.companyId !== null ? { companyId: scope.companyId } : null
  const batch =
    companyFilter === null
      ? null
      : await prisma.billingBatch.findFirst({
          where: { id: billingBatchId, organizationId: user.organizationId, deletedAt: null, ...companyFilter },
          select: {
            batchNumber: true,
            period: true,
            status: true,
            sentAt: true,
            dueDate: true,
            sellerName: true,
            sellerTaxId: true,
            sellerAddress: true,
            sellerPhone: true,
            sellerBranchCode: true,
            sellerProfileSnapshot: true,
            buyerName: true,
            buyerTaxId: true,
            buyerAddress: true,
            buyerPhone: true,
            buyerBranchCode: true,
            company: { select: { name: true, taxId: true, address: true, phone: true, branchCode: true } },
            organization: { select: { name: true, taxId: true, address: true, phone: true, branchCode: true } },
            revenues: {
              where: { deletedAt: null },
              orderBy: [{ revenueDate: 'asc' }, { id: 'asc' }],
              select: {
                revenueDate: true,
                grossSatang: true,
                vatSatang: true,
                totalSatang: true,
                vatRatePctUsed: true,
                case: { select: { caseRef: true } },
              },
            },
          },
        })
  if (batch === null) throw new RevenueError('BILLING_BATCH_NOT_FOUND', { detail: `billing_batch=${billingBatchId}` })
  if (batch.status === 'draft') {
    throw new RevenueError('BILLING_BATCH_INVALID_STATUS', { detail: 'ใบแจ้งหนี้ออกได้หลังส่งรอบวางบิลแล้ว' })
  }

  return {
    batchNumber: batch.batchNumber,
    period: batch.period,
    sentAt: batch.sentAt,
    dueDate: batch.dueDate,
    ...billingInvoicePartiesOf(batch, { seller: batch.organization, buyer: batch.company }),
    sellerProfile: parseSellerProfileSnapshot(batch.sellerProfileSnapshot),
    lines: batch.revenues.map((revenue) => ({
      caseRef: revenue.case.caseRef,
      revenueDate: revenue.revenueDate,
      grossSatang: revenue.grossSatang,
      vatSatang: revenue.vatSatang,
      totalSatang: revenue.totalSatang,
      vatRatePct: revenue.vatRatePctUsed.toString(),
    })),
  }
}
