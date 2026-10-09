import type { Metadata } from 'next'
import { PortalTaxInvoices } from '@/components/portal/tax-invoices-list'
import { requirePortalViewAsPage } from '@/lib/portal/view-as-page'

export const metadata: Metadata = { title: 'ใบกำกับภาษี' }

/** `/portal/view-as/<companyId>/tax-invoices` — ใบกำกับภาษีของบริษัทในโหมดดูแทน (มติ U59) · ดาวน์โหลดได้ (ลง audit) */
export default async function PortalViewAsTaxInvoicesPage({ params }: { params: Promise<{ companyId: string }> }) {
  await requirePortalViewAsPage((await params).companyId)
  return <PortalTaxInvoices canDownload />
}
