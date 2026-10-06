import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_ORGANIZATION_PROFILE, VIEW_ORGANIZATION_PROFILE } from '@/lib/organization/permissions'
import { getOrganizationProfile, updateOrganizationProfile } from '@/lib/organization/queries'
import { organizationProfileUpdateSchema } from '@/lib/organization/schemas'

/**
 * ข้อมูลองค์กร (มติ PO U99) — `GET`/`PATCH /api/settings/organization`
 *
 * สิทธิ์: อ่าน = `view:view_master_data` · แก้ = `manage:manage_invoice_numbering` (ล็อก Superadmin — ข้อมูลผู้ขาย
 * บนเอกสารภาษี) · เหตุผลบังคับ · แก้แล้วมีผลกับเอกสารที่ออกหลังจากนี้เท่านั้น (เอกสารเดิมอ่าน snapshot)
 */

export const GET = withApiPermission(
  'view',
  VIEW_ORGANIZATION_PROFILE,
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getOrganizationProfile(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  MANAGE_ORGANIZATION_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = organizationProfileUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...input } = parsed.data
    const data = await updateOrganizationProfile({ actor: user, meta: getRequestMeta(request), reason }, input)
    return Response.json({ data })
  },
)
