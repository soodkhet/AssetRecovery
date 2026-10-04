import { apiSuccess } from '@/lib/api/envelope'
import { requirePortalRow, withPortal } from '@/lib/portal/guard'
import { findPortalCompanyProfile } from '@/lib/portal/queries/profile'

/**
 * `GET /api/portal/company-profile` (`97` §6.6/§17) — ข้อมูลบริษัทของผู้เรียก (id จาก session เท่านั้น)
 * · template = ชื่อ + model (ไม่มีอัตรา/รหัส — มติ O44)
 */
export const GET = withPortal('profile', {}, async (request, _context, portal) => {
  const row = await findPortalCompanyProfile(portal)
  const owned = await requirePortalRow(portal, row, { type: 'finance_companies', id: portal.companyId }, { request })
  return apiSuccess(owned.dto)
})
