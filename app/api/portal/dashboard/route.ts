import { apiSuccess } from '@/lib/api/envelope'
import { withPortal } from '@/lib/portal/guard'
import { getPortalDashboard } from '@/lib/portal/queries/dashboard'

/**
 * `GET /api/portal/dashboard` (`97` §5/§17 · มติ O43 D9/D12) — KPI 4 ใบของบริษัทตัวเอง คำนวณสด
 * capability `portal_cases` (ภาพรวม = หมวดเคส) · การ์ดของหมวดที่ไม่มีสิทธิ์ไม่มีคีย์ใน response
 */
export const GET = withPortal('cases', {}, async (_request, _context, portal) => apiSuccess(await getPortalDashboard(portal)))
