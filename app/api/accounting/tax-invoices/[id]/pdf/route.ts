import type { NextRequest } from 'next/server'
import { renderTaxInvoice } from '@/components/pdf/tax-invoice'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { getTaxInvoiceDocSource } from '@/lib/sales/queries'
import { buildTaxInvoiceDoc, SALES_READ_CAPABILITIES } from '@/lib/sales/sales'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API (fs/stream) — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `GET /api/accounting/tax-invoices/:id/pdf` — ใบกำกับภาษีแบบเต็มรูป (`28` §6.2)
 *
 * สิทธิ์ = **ดู** รายการขาย/ใบกำกับภาษี (การเงิน/ผู้บริหารพิมพ์สำเนาได้ตาม `31` §12) — การ*ออก*
 * เอกสารใหม่ยังเป็นของบัญชีเท่านั้น · ใบที่ยกเลิกแล้วพิมพ์ได้ แต่มีแถบ "ยกเลิก" บนหน้ากระดาษ
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  SALES_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    const source = await getTaxInvoiceDocSource(user, id)
    const doc = buildTaxInvoiceDoc(source)
    const pdf = await renderTaxInvoice(doc)

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(doc.fileName),
        // เอกสารทางภาษี — ห้าม cache ระหว่างทาง (สถานะยกเลิกต้องเห็นทันที)
        'cache-control': 'no-store',
      },
    })
  },
)
