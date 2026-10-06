import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'
import { pickReceivingAccount, type DocBankAccount } from '@/lib/organization/bank-account-line'
import { parseSellerProfileSnapshot } from '@/lib/organization/profile'
import { parseDocumentTemplateSnapshot } from '@/lib/settings/tax-doc-template'
import {
  billingInvoicePartiesOf,
  parseBillingInvoiceDetailSnapshot,
  type BillingInvoiceSource,
} from '@/lib/revenue/billing-invoice'
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
            documentTemplateSnapshot: true,
            invoiceDetailSnapshot: true,
            buyerName: true,
            buyerTaxId: true,
            buyerAddress: true,
            buyerPhone: true,
            buyerBranchCode: true,
            whtWithheldByCustomerSatang: true,
            company: {
              select: {
                name: true,
                taxId: true,
                address: true,
                phone: true,
                branchCode: true,
                whtWithheldByCustomerPct: true,
              },
            },
            organization: { select: { name: true, taxId: true, address: true, phone: true, branchCode: true } },
            revenues: {
              where: { deletedAt: null },
              orderBy: [{ revenueDate: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                revenueDate: true,
                grossSatang: true,
                vatSatang: true,
                totalSatang: true,
                vatRatePctUsed: true,
                case: {
                  select: {
                    caseRef: true,
                    assetDescription: true,
                    // ใบส่งมอบของเครื่องในเคส (มติ PO U100 — บรรทัดรองของรายการ) · ล็อตยืนยันแล้วก่อน
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
  if (batch === null) throw new RevenueError('BILLING_BATCH_NOT_FOUND', { detail: `billing_batch=${billingBatchId}` })
  if (batch.status === 'draft') {
    throw new RevenueError('BILLING_BATCH_INVALID_STATUS', { detail: 'ใบแจ้งหนี้ออกได้หลังส่งรอบวางบิลแล้ว' })
  }

  // มติ PO 07/10/2569 U130 — รอบที่ส่งหลัง U130 อ่าน % ภาษีลูกค้าหัก/บัญชีรับเงิน/รายละเอียดทรัพย์ จาก snapshot ตอนส่ง
  // (พิมพ์ซ้ำ/Export Pack ได้ตัวเลขเดิม) · รอบก่อน U130 = ค่าปัจจุบัน (พฤติกรรมเดิม)
  const detail = parseBillingInvoiceDetailSnapshot(batch.invoiceDetailSnapshot)
  const receivingAccount = detail !== null ? detail.receivingAccount : await loadReceivingAccount(user.organizationId)

  return {
    batchNumber: batch.batchNumber,
    period: batch.period,
    sentAt: batch.sentAt,
    dueDate: batch.dueDate,
    ...billingInvoicePartiesOf(batch, { seller: batch.organization, buyer: batch.company }),
    sellerProfile: parseSellerProfileSnapshot(batch.sellerProfileSnapshot),
    templateSnapshot: parseDocumentTemplateSnapshot(batch.documentTemplateSnapshot),
    lines: batch.revenues.map((revenue) => ({
      caseRef: revenue.case.caseRef,
      revenueDate: revenue.revenueDate,
      grossSatang: revenue.grossSatang,
      vatSatang: revenue.vatSatang,
      totalSatang: revenue.totalSatang,
      vatRatePct: revenue.vatRatePctUsed.toString(),
      ...(detail?.lines.get(revenue.id) ?? {
        assetDescription: revenue.case.assetDescription,
        handoverDocRef: revenue.case.assets[0]?.lot?.docRef ?? null,
      }),
    })),
    customerWhtPct:
      detail !== null
        ? detail.customerWhtPct
        : batch.company.whtWithheldByCustomerPct === null
          ? null
          : batch.company.whtWithheldByCustomerPct.toNumber(),
    recordedCustomerWhtSatang: batch.whtWithheldByCustomerSatang,
    receivingAccount,
  }
}

/** บัญชีรับโอนของเรา (ค่าตั้งบัญชีธนาคาร — ใช้รับเงิน · บัญชีหลักก่อน) — ไม่มี ⇒ ไม่พิมพ์แถว (มติ PO U100) */
export async function loadReceivingAccount(
  organizationId: string,
  client: Pick<typeof prisma, 'bankAccount'> = prisma,
): Promise<DocBankAccount | null> {
  const accounts = await client.bankAccount.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { bankName: true, accountNumber: true, accountName: true, usage: true, isPrimary: true },
  })
  const receiving = pickReceivingAccount(accounts)
  return receiving === null
    ? null
    : { bankName: receiving.bankName, accountNumber: receiving.accountNumber, accountName: receiving.accountName }
}
