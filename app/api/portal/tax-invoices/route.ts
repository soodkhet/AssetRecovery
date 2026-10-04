import { apiSuccess } from '@/lib/api/envelope'
import { withPortal } from '@/lib/portal/guard'
import { listPortalTaxInvoices } from '@/lib/portal/queries/finance'

/** `GET /api/portal/tax-invoices` — ใบกำกับภาษีของบริษัทตัวเอง (`97` §6.3/§17) · active/cancelled แสดงสถานะ */
export const GET = withPortal('finance', {}, async (_request, _context, portal) =>
  apiSuccess(await listPortalTaxInvoices(portal)),
)
