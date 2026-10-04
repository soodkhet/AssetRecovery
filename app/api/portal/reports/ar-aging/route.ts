import { apiSuccess } from '@/lib/api/envelope'
import { withPortal } from '@/lib/portal/guard'
import { getPortalArAging } from '@/lib/portal/queries/finance'

/**
 * `GET /api/portal/reports/ar-aging` — อายุหนี้ของบริษัทตัวเอง (`97` §6.5/§17 · มติ O43 D9)
 * คำนวณสดทุกครั้ง (ไม่ใช้แคชรายงานภายใน) · นับเฉพาะรอบวางบิล `sent` ขึ้นไป
 */
export const GET = withPortal('finance', {}, async (_request, _context, portal) =>
  apiSuccess(await getPortalArAging(portal)),
)
