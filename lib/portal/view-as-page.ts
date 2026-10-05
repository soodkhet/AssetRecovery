import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { emitAudit } from '@/lib/audit/audit'
import { CLIENT_PORTAL_PATH, DASHBOARD_PATH } from '@/lib/auth/constants'
import { requireSessionPage } from '@/lib/auth/page-guard'
import { isPortalOnlyUser } from '@/lib/auth/permission'
import { normalizeIpAddress } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import { canViewPortalAs, isPortalViewAsCompanyId } from '@/lib/portal/view-as'
import { prisma } from '@/lib/prisma'

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

export interface PortalViewAsCompany {
  id: string
  name: string
  status: string
}

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

/** ชนิดปลายทางของ audit การเปิดโหมดดูแทน — แถวบริษัทที่ถูกเปิดดู */
export const PORTAL_VIEW_AS_AUDIT_TARGET = 'finance_companies'

/**
 * บันทึก audit `view_as` เมื่อเปิดโหมดดูแทน **ครั้งแรกต่อ session ต่อบริษัท** (session = นับจาก `users.last_login_at`)
 * · เปิดซ้ำ/เปลี่ยนหน้าใน session เดิมไม่ลงซ้ำ · คืน `true` เมื่อเขียนแถวใหม่
 * audit ล้มต้องไม่ทำให้หน้าเปิดไม่ได้ (การดูเป็น GET ล้วน) — log แล้วไปต่อ
 */
export async function recordPortalViewAsOpen(
  user: SessionUser,
  company: PortalViewAsCompany,
  meta: { ipAddress: string | null; userAgent: string | null } = { ipAddress: null, userAgent: null },
): Promise<boolean> {
  try {
    const since = user.loginAt === null ? null : new Date(user.loginAt)
    const existing = await prisma.auditLog.findFirst({
      where: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: 'view_as',
        targetType: PORTAL_VIEW_AS_AUDIT_TARGET,
        targetId: company.id,
        ...(since === null || Number.isNaN(since.getTime()) ? {} : { createdAt: { gte: since } }),
      },
      select: { id: true },
    })
    if (existing !== null) return false

    await emitAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorRole: user.roleName,
      action: 'view_as',
      targetType: PORTAL_VIEW_AS_AUDIT_TARGET,
      targetId: company.id,
      after: {
        channel: 'portal',
        mode: 'view_as',
        company_id: company.id,
        company_name: company.name,
        company_status: company.status,
        viewer_role_group: user.roleGroup,
        session_login_at: user.loginAt,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    return true
  } catch (error) {
    console.error('[portal] view_as audit failed', error)
    return false
  }
}

/** ip/user-agent ของ request หน้า (server component) — ใช้ประกอบ audit */
export async function pageRequestMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const list = await headers()
  return {
    ipAddress: normalizeIpAddress(list.get('x-forwarded-for') ?? list.get('x-real-ip')),
    userAgent: list.get('user-agent'),
  }
}
