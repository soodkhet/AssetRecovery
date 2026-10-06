import { renderBillingInvoice } from '@/components/pdf/billing-invoice'
import { emitAudit } from '@/lib/audit/audit'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { attachmentHeader } from '@/lib/format/attachment'
import { billingInvoiceLetterhead, createLetterheadResolver } from '@/lib/organization/letterhead'
import { portalScopedUser, portalViewAsAuditFields, requirePortalRow, withPortal } from '@/lib/portal/guard'
import { findPortalBillingBatchRow } from '@/lib/portal/queries/finance'
import { buildBillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { getBillingInvoiceSource } from '@/lib/revenue/billing-invoice-queries'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

const TARGET = 'billing_batches'

/**
 * `GET /api/portal/billing-batches/:id/invoice-pdf` — **ใบแจ้งหนี้/ใบวางบิล** ของบริษัทตัวเอง (มติ PO U95 · `97` §17)
 *
 * - ต้องมี `portal_finance` + `portal_download` · id ข้ามบริษัท/ไม่พบ/รอบยัง draft ⇒ 403 + audit
 * - source + renderer ตัวเดียวกับ route ภายใน (เอกสารเดียวกันทุกตัวอักษร) · ลง audit `export` ทุกครั้ง
 */
export const GET = withPortal<RouteContext>('finance', { download: true }, async (request, context, portal) => {
  const { id } = await context.params
  const row = await requirePortalRow(portal, await findPortalBillingBatchRow(portal, id), { type: TARGET, id }, {
    request,
    download: true,
  })

  // scope `company` ⇒ ยามใน `getBillingInvoiceSource` ตรวจบริษัทซ้ำอีกชั้น (โหมดดูแทน — มติ U59)
  const source = await getBillingInvoiceSource(portalScopedUser(portal), row.id)
  const doc = buildBillingInvoiceDoc(source)
  const pdf = await renderBillingInvoice(
    doc,
    await billingInvoiceLetterhead(createLetterheadResolver(portal.user.organizationId), source),
  )

  const meta = getRequestMeta(request)
  await emitAudit({
    organizationId: portal.user.organizationId,
    actorId: portal.user.id,
    actorRole: portal.user.roleName,
    action: 'export',
    targetType: TARGET,
    targetId: row.id,
    before: null,
    after: {
      channel: 'portal',
      document: 'billing_invoice_pdf',
      batch_number: row.batchNumber,
      file_name: doc.fileName,
      company_id: portal.companyId,
      ...portalViewAsAuditFields(portal),
    },
    reason: null,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  })

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': attachmentHeader(doc.fileName),
      'cache-control': 'no-store',
    },
  })
})
