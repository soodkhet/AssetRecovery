import { PortalTaxInvoices } from '@/components/portal/tax-invoices-list'
import { canAccess } from '@/lib/portal/access'
import { requirePortalPage } from '@/lib/portal/page-guard'

/**
 * `/portal/tax-invoices` — ใบกำกับภาษี (`97` §6.3 · หมวด `portal_finance`) · อ่านอย่างเดียว
 * ปุ่มดาวน์โหลดแสดงเฉพาะผู้มี `portal_download` ด้วย (ชั้น UX — API ตรวจซ้ำ)
 */
export default async function PortalTaxInvoicesPage() {
  const user = await requirePortalPage('finance')
  return <PortalTaxInvoices canDownload={canAccess('finance', user.capabilities, { download: true })} />
}
