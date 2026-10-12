import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { previewTaxInvoice } from '@/lib/sales/queries'
import { MANAGE_TAX_INVOICE } from '@/lib/sales/sales'
import { taxInvoiceCreateSchema } from '@/lib/sales/schemas'

/**
 * `GET /api/accounting/tax-invoices/preview?cashReceiptId=…|replacesInvoiceId=…` (mytester3 LR3-02)
 *
 * พรีวิวยอดที่จะออกจริง — สูตรเดียวกับ `POST /api/accounting/tax-invoices` · ไม่จองเลข ไม่บันทึกเอกสาร
 * · สิทธิ์เดียวกับการออก (`manage_tax_invoice` — `25` §7.4)
 */
export const GET = withApiPermission(
  'manage',
  MANAGE_TAX_INVOICE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = taxInvoiceCreateSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await previewTaxInvoice({ actor: user, meta: getRequestMeta(request) }, parsed.data))
  },
)
