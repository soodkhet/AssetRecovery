import { renderTaxInvoice } from '@/components/pdf/tax-invoice'
import { emitAudit } from '@/lib/audit/audit'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { attachmentHeader } from '@/lib/format/attachment'
import { createLetterheadResolver, taxInvoiceLetterhead } from '@/lib/organization/letterhead'
import { portalScopedUser, portalViewAsAuditFields, requirePortalRow, withPortal } from '@/lib/portal/guard'
import { findPortalTaxInvoiceRow } from '@/lib/portal/queries/finance'
import { getTaxInvoiceDocSource } from '@/lib/sales/queries'
import { buildTaxInvoiceDoc } from '@/lib/sales/sales'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

const TARGET = 'tax_invoices'

/**
 * `GET /api/portal/tax-invoices/:id/download` — PDF ใบกำกับภาษีของบริษัทตัวเอง (`97` §6.3/§17/§18)
 *
 * - ต้องมี `portal_finance` + `portal_download` (ยามหมวด) · id ข้ามบริษัท/ไม่พบ/รอบบิลยัง draft ⇒ 403 + audit
 * - **source + renderer ตัวเดียวกับ route ภายใน** (`getTaxInvoiceDocSource` → `buildTaxInvoiceDoc` →
 *   `renderTaxInvoice` — มติ O43 D7: เอกสารเหมือนฉบับที่ฝ่ายบัญชีเห็นทุกตัวอักษร) · ใบที่ยกเลิกมีแถบ "ยกเลิก"
 * - ลง audit `export` ทุกครั้งที่ดาวน์โหลดสำเร็จ (trace กลับผู้ดาวน์โหลดได้ — Rule 03)
 */
export const GET = withPortal<RouteContext>('finance', { download: true }, async (request, context, portal) => {
  const { id } = await context.params
  const row = await requirePortalRow(portal, await findPortalTaxInvoiceRow(portal, id), { type: TARGET, id }, {
    request,
    download: true,
  })

  // ผู้ใช้บริษัทมี scope `company` ⇒ ยามใน `getTaxInvoiceDocSource` ตรวจบริษัทซ้ำอีกชั้น
  // (โหมดดูแทนของผู้ใช้ภายใน — บังคับ scope เป็นบริษัทที่เปิดดู · มติ U59)
  const source = await getTaxInvoiceDocSource(portalScopedUser(portal), row.id)
  const doc = buildTaxInvoiceDoc(source)
  const pdf = await renderTaxInvoice(
    doc,
    await taxInvoiceLetterhead(createLetterheadResolver(portal.user.organizationId), source),
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
      document: 'tax_invoice_pdf',
      invoice_number: row.invoiceNumber,
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
      // เอกสารทางภาษี — ห้าม cache ระหว่างทาง (สถานะยกเลิกต้องเห็นทันที)
      'cache-control': 'no-store',
    },
  })
})
