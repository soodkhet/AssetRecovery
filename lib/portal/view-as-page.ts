import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { CLIENT_PORTAL_PATH, DASHBOARD_PATH } from '@/lib/auth/constants'
import { requireSessionPage } from '@/lib/auth/page-guard'
import { isPortalOnlyUser } from '@/lib/auth/permission'
import { normalizeIpAddress } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { canViewPortalAs, isPortalViewAsCompanyId } from '@/lib/portal/view-as'
import type { PortalViewAsCompany } from '@/lib/portal/view-as-audit'
import { prisma } from '@/lib/prisma'

export { PORTAL_VIEW_AS_AUDIT_TARGET, recordPortalViewAsOpen, type PortalViewAsCompany } from '@/lib/portal/view-as-audit'

/**
 * Route guard ของหน้า `/portal/view-as/[companyId]/**` — โหมด "ดู portal ในฐานะลูกค้า" (มติ PO U59 · `97` §13.1)
 *
 * - ไม่มี session / หมดอายุ / ต้องเปลี่ยนรหัส → ตาม `requireSessionPage()`
 * - ผู้ใช้บริษัทจริง → `/portal` ของตัวเอง (path นี้ไม่มีผล — ห้ามใช้ข้ามบริษัท)
 * - ผู้ใช้ภายในไม่มี `view_client_portal_as` → `/dashboard`
 * - id ไม่ใช่ uuid / ไม่มีบริษัทนี้ใน org / ถูกลบ → 404
 * - บริษัทถูกระงับ → ยังเปิดดูได้ (เพื่อช่วยลูกค้า) — ป้ายบนสุดบอกสถานะ
 *
 * ⚠️ ชั้น UX เท่านั้น — ข้อมูลจริงมาจาก `/api/portal/*?as=<id>` ที่ `requirePortalAccess()` ตรวจซ้ำทุก request (DEC-002)
 */

export interface PortalViewAsPage {
  user: SessionUser
  company: PortalViewAsCompany
}

export async function requirePortalViewAsPage(rawCompanyId: string): Promise<PortalViewAsPage> {
  const user = await requireSessionPage()
  if (isPortalOnlyUser(user)) redirect(CLIENT_PORTAL_PATH)
  if (!canViewPortalAs(user)) redirect(DASHBOARD_PATH)
  if (!isPortalViewAsCompanyId(rawCompanyId)) notFound()

  const company = await prisma.financeCompany.findFirst({
    where: { id: rawCompanyId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true, status: true },
  })
  if (company === null) notFound()
  return { user, company }
}

/** ip/user-agent ของ request หน้า (server component) — ใช้ประกอบ audit */
export async function pageRequestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const list = await headers()
  return {
    ipAddress: normalizeIpAddress(list.get('x-forwarded-for') ?? list.get('x-real-ip')),
    userAgent: list.get('user-agent'),
  }
}
