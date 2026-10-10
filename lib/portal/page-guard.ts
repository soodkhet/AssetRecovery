import { redirect } from 'next/navigation'
import { CLIENT_PORTAL_PATH, DASHBOARD_PATH, LOGIN_PATH } from '@/lib/auth/constants'
import { isCompanyActive, loadCompanyStatus } from '@/lib/auth/company-status'
import { requireSessionPage } from '@/lib/auth/page-guard'
import { isPortalOnlyUser } from '@/lib/auth/permission'
import type { SessionUser } from '@/lib/auth/types'
import { deniedHref } from '@/lib/nav/denied-notice'
import { canAccess, type PortalSection } from '@/lib/portal/access'

/**
 * Route guard ของหน้า `app/portal/**` (`97` §11/§13 · `06` v2.6 §7.2 · มติ PO 05/10/2569 U6/O43 D2/D5/D11)
 *
 * - ไม่มี session / บัญชีปิดใช้ / หมดอายุ → หน้า login (ผ่าน `requireSessionPage()`)
 * - ผู้ใช้ภายใน + Superadmin → `/dashboard` (D11 — เดิม `/portal` เปิดได้ทุก session · R10v3-N1)
 * - บริษัทไม่ active → หน้า login พร้อมเหตุผล `COMPANY_SUSPENDED`
 * - ระบุหมวดแล้วไม่มีสิทธิ์หมวดนั้น → หน้าแรกพอร์ทัล `?denied=<หมวด>` พร้อมข้อความ (staging E-072 · หน้าแรกไม่ระบุหมวด จึงไม่วนซ้ำ)
 *
 * ⚠️ ชั้น UX เท่านั้น — ข้อมูลจริงต้องมาจาก `/api/portal/*` ที่ผ่าน `requirePortalAccess()` (DEC-002)
 */
export async function requirePortalPage(section?: PortalSection): Promise<SessionUser> {
  const user = await requireSessionPage()
  if (!isPortalOnlyUser(user)) redirect(DASHBOARD_PATH)

  const companyStatus = await loadCompanyStatus(user.organizationId, user.companyId)
  if (!isCompanyActive(companyStatus)) redirect(`${LOGIN_PATH}?reason=COMPANY_SUSPENDED`)

  if (section !== undefined && !canAccess(section, user.capabilities)) redirect(deniedHref(CLIENT_PORTAL_PATH, section))
  return user
}
