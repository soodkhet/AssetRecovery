import { apiSuccess } from '@/lib/api/envelope'
import { withPortal } from '@/lib/portal/guard'
import { listPortalBillingBatches } from '@/lib/portal/queries/finance'

/**
 * `GET /api/portal/billing-batches` — รอบวางบิลของบริษัทตัวเอง (`97` §6.2/§17 · มติ O43 D9)
 * เฉพาะ `sent` ขึ้นไป (draft ไม่แสดง) · ยอดค้างจากสูตรกลาง `arOutstandingSatang()`
 */
export const GET = withPortal('finance', {}, async (_request, _context, portal) =>
  apiSuccess(await listPortalBillingBatches(portal)),
)
