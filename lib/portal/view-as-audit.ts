import { emitAudit } from '@/lib/audit/audit'
import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'

/**
 * audit การเปิดโหมด "ดู portal ในฐานะลูกค้า" (มติ PO U59/U61) — ใช้ร่วมทั้งหน้า `/portal/view-as/**`
 * และ API `/api/portal/*?as=<id>` ที่ถูกเรียกตรง (มติ PO U141) · ไม่ import `next/headers` เพื่อให้ guard ของ API ใช้ได้
 */

export interface PortalViewAsCompany {
  id: string
  name: string
  status: string
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
