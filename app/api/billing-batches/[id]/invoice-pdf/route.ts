import type { NextRequest } from 'next/server'
import { renderBillingInvoice } from '@/components/pdf/billing-invoice'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { emitDocumentExportAudit } from '@/lib/audit/audit'
import { attachmentHeader } from '@/lib/format/attachment'
import {
  billingInvoiceLetterhead,
  billingInvoiceTemplate,
  createLetterheadResolver,
} from '@/lib/organization/letterhead'
import { buildBillingInvoiceDoc } from '@/lib/revenue/billing-invoice'
import { getBillingInvoiceSource } from '@/lib/revenue/billing-invoice-queries'
import { BILLING_READ_CAPABILITIES } from '@/lib/revenue/queries'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API (fs/stream) — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `GET /api/billing-batches/:id/invoice-pdf` — **ใบแจ้งหนี้/ใบวางบิล** ของรอบที่ส่งแล้ว (มติ PO U95 · `19` §8)
 *
 * สิทธิ์ = ดูรอบวางบิล (ชุดเดียวกับ `GET /api/billing-batches/:id`) · รอบ `draft` ⇒ `BILLING_BATCH_INVALID_STATUS`
 * · ไม่ใช่เอกสารภาษี (ไม่เดินเลขใบกำกับ ไม่เกิดภาระ VAT) · ลง audit `export` ทุกครั้ง (Rule 03)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  BILLING_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const source = await getBillingInvoiceSource(user, id)
    const doc = buildBillingInvoiceDoc(source)
    const resolver = createLetterheadResolver(user.organizationId)
    const pdf = await renderBillingInvoice(
      doc,
      await billingInvoiceLetterhead(resolver, source),
      await billingInvoiceTemplate(resolver, source),
    )

    await emitDocumentExportAudit({
      actor: user,
      request,
      targetType: 'billing_batches',
      targetId: id,
      document: 'billing_invoice_pdf',
      fileName: doc.fileName,
      details: { batch_number: source.batchNumber, total_satang: doc.amounts.totalSatang },
    })

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(doc.fileName),
        'cache-control': 'no-store',
      },
    })
  },
)
