import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'
import type { BillingInvoiceSource } from '@/lib/revenue/billing-invoice'
import { RevenueError } from '@/lib/revenue/errors'

/**
 * ข้อมูลดิบของ **ใบแจ้งหนี้/ใบวางบิล** (มติ PO U95) — ใช้ร่วม route ภายในและพอร์ทัล (เอกสารเดียวกันทุกตัวอักษร)
 *
 * - รอบ `draft` ยังไม่ได้ส่งให้ลูกค้า ⇒ ยังไม่มีใบแจ้งหนี้ (`BILLING_BATCH_INVALID_STATUS`)
 * - scope: Company User เห็นเฉพาะบริษัทตัวเอง · นอก scope = 404 แบบไม่ leak (`BILLING_BATCH_NOT_FOUND`)
 * - ผู้ขาย/ผู้ซื้อ = ค่าปัจจุบันขององค์กร/บริษัท (ใบแจ้งหนี้ไม่ใช่เอกสารภาษี — snapshot คู่ค้าบังคับเฉพาะใบเสร็จรับเงิน/ใบกำกับภาษี)
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
    seller: { ...batch.organization },
    buyer: { ...batch.company, address: batch.company.address ?? '' },
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
