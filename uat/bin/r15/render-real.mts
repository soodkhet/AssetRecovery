// R15a: เรนเดอร์ PDF เอกสารจริงจาก DB นอก Next (เลี่ยง BUG-172) — ทำตาม body ของ route เดียวกันทุกบรรทัด
// อ่าน DB อย่างเดียว · ไม่ลง audit export (ไม่ได้ผ่าน route) · ผู้สั่ง = Superadmin (in-process)
import { writeFileSync } from 'node:fs'
import type { SessionUser } from '@/lib/auth/types'
import { renderBillingInvoice } from '@/components/pdf/billing-invoice'
import { renderTaxInvoice } from '@/components/pdf/tax-invoice'
import { renderPayoutBatchSummary } from '@/components/pdf/payout-batch-summary'
import { renderPaymentVouchers } from '@/components/pdf/payment-voucher'
import { renderPayslips } from '@/components/pdf/payslip'
import { renderHandoverNote } from '@/components/pdf/handover-note'
import { renderAdvanceRequestPdf } from '@/components/pdf/advance-request'
import { renderAdvanceReturnPdf } from '@/components/pdf/advance-return'
import { renderSubstituteReceiptPdf } from '@/components/pdf/substitute-receipt'
import { renderWhtCertificate } from '@/components/pdf/wht-certificate'
import { billingInvoiceLetterhead, createLetterheadResolver, currentLetterhead, taxInvoiceLetterhead } from '@/lib/organization/letterhead'
import { buildBillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { getBillingInvoiceSource } from '@/lib/revenue/billing-invoice-queries'
import { getTaxInvoiceDocSource } from '@/lib/sales/queries'
import { buildTaxInvoiceDoc } from '@/lib/sales/sales'
import { buildPaymentVoucherDocs, buildPayoutSummaryDoc, buildPayslipDocs, selectPayoutDocItems } from '@/lib/payout/payout-doc'
import { getPayoutDocSource } from '@/lib/payout/queries'
import { buildHandoverDoc } from '@/lib/warehouse/handover-doc'
import { getHandoverDocSource } from '@/lib/warehouse/queries'
import { buildAdvanceRequestDoc, buildAdvanceReturnDoc } from '@/lib/advances/advance-doc'
import { getAdvanceRequestDocSource, getAdvanceReturnDocSource } from '@/lib/advances/doc-queries'
import { getSubstituteReceiptSource, toSubstituteReceiptDocSource } from '@/lib/substitute-receipts/queries'
import { buildSubstituteReceiptDoc } from '@/lib/substitute-receipts/substitute-receipt-doc'
import { getWhtCertificateDocSource } from '@/lib/wht/queries'
import { buildWhtCertificateDoc } from '@/lib/wht/wht'

const ORG = '00000000-0000-0000-0000-000000000001'
const user = { id: 'a880581e-0281-4c90-95ec-2e08354aca90', organizationId: ORG, supabaseUid: 'x', username: 'admin', email: null, fullName: 'admin', status: 'active', roleId: 'x', roleName: 'Superadmin', roleGroup: 'system', isSuperadmin: true, teamId: null, companyId: null, capabilities: {}, scope: { kind: 'global', teamIds: [], companyId: null, userId: 'a880581e-0281-4c90-95ec-2e08354aca90' }, loginAt: null } as unknown as SessionUser
const out = (n: string, b: Buffer) => { writeFileSync(`uat/fixtures/downloads-R15/real-${n}.pdf`, b); console.log(n, b.length) }
const lh = () => currentLetterhead(ORG)
const jobs: Record<string, () => Promise<Buffer>> = {
  'BL-2569-006': async () => { const s = await getBillingInvoiceSource(user, '417ea137-1789-419f-a04f-8916e173d019'); return renderBillingInvoice(buildBillingInvoiceDoc(s), await billingInvoiceLetterhead(createLetterheadResolver(ORG), s)) },
  'INV-0008': async () => { const s = await getTaxInvoiceDocSource(user, 'a02be95b-e136-49cd-8396-4c838bb4cbdc'); return renderTaxInvoice(buildTaxInvoiceDoc(s), await taxInvoiceLetterhead(createLetterheadResolver(ORG), s)) },
  'INV-0005-cancelled': async () => { const s = await getTaxInvoiceDocSource(user, '079ce195-1db2-427a-a8a0-845ed6918e2b'); return renderTaxInvoice(buildTaxInvoiceDoc(s), await taxInvoiceLetterhead(createLetterheadResolver(ORG), s)) },
  'summary-IN-R14': async () => { const s = await getPayoutDocSource(user, '9d94d2b4-2eb2-4cd0-a4e8-de7aa7bbbd67'); return renderPayoutBatchSummary(buildPayoutSummaryDoc(s.batch, s.issuer), await lh()) },
  'summary-IN-R13b': async () => { const s = await getPayoutDocSource(user, 'c1e8fdb8-c6bf-4a6a-b817-ca5939adcca2'); return renderPayoutBatchSummary(buildPayoutSummaryDoc(s.batch, s.issuer), await lh()) },
  'voucher-IN-R13b': async () => { const s = await getPayoutDocSource(user, 'c1e8fdb8-c6bf-4a6a-b817-ca5939adcca2'); return renderPaymentVouchers(buildPaymentVoucherDocs(selectPayoutDocItems(s.batch, undefined), s.issuer, s.payees), await lh()) },
  'payslip-IN-R14': async () => { const s = await getPayoutDocSource(user, '9d94d2b4-2eb2-4cd0-a4e8-de7aa7bbbd67'); return renderPayslips(buildPayslipDocs(selectPayoutDocItems(s.batch, undefined), s.issuer, s.payees), await lh()) },
  'LOT-2569-008': async () => { const s = await getHandoverDocSource(user, '9a3fd9d3-89c1-4a27-8997-60dc66362674'); return renderHandoverNote(buildHandoverDoc(s.lot, s.issuer, s.recipient), await lh()) },
  'ADV-cleared': async () => { const s = await getAdvanceRequestDocSource(user, '02221e05-4e8d-4e57-aa54-5d8cd8b557dd'); const l = await lh(); return renderAdvanceRequestPdf(buildAdvanceRequestDoc(s, l), l) },
  'RAV': async () => { const s = await getAdvanceReturnDocSource(user, '02221e05-4e8d-4e57-aa54-5d8cd8b557dd', '5eafdbd8-c4af-4a26-8c23-dc6d119bb70a'); const l = await lh(); return renderAdvanceReturnPdf(buildAdvanceReturnDoc(s, l), l) },
  'CRT': async () => { const r = await getSubstituteReceiptSource(user, '20f59bf2-f3f4-47e4-9321-05a072c04699'); const l = await lh(); return renderSubstituteReceiptPdf(buildSubstituteReceiptDoc(toSubstituteReceiptDocSource(r), l), l) },
  'WHT-2569-018': async () => { const s = await getWhtCertificateDocSource(user, 'bc92b2a9-a690-415e-bb6d-d9d730b1a21e'); return renderWhtCertificate(buildWhtCertificateDoc(s)) },
}
for (const [n, f] of Object.entries(jobs)) { try { out(n, await f()) } catch (e) { console.log(n, 'ERR', (e as Error).message.slice(0, 300)) } }
process.exit(0)
