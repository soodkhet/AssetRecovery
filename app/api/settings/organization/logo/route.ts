import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_ORGANIZATION_PROFILE } from '@/lib/organization/permissions'
import { removeOrganizationLogo, setOrganizationLogo } from '@/lib/organization/queries'
import { organizationLogoRemoveSchema, organizationLogoSetSchema } from '@/lib/organization/schemas'

/**
 * โลโก้บริษัทบนหัวเอกสาร (มติ PO U99) — `POST`/`DELETE /api/settings/organization/logo`
 *
 * - `POST { path, reason }` — ผูกไฟล์ที่อัปโหลดผ่าน `POST /api/storage/upload-url` (target `organization_logo`)
 *   server ตรวจ prefix ขององค์กร + ชนิดจากเนื้อไฟล์ (PNG/JPG) + ขนาด ≤ 1 MB ก่อนบันทึก
 * - `DELETE { reason }` — ปลดโลโก้ (ไฟล์เดิมยังอยู่ให้เอกสารที่ snapshot ไว้)
 * สิทธิ์ = `manage:manage_invoice_numbering` (Superadmin เท่านั้น)
 */

export const runtime = 'nodejs'

export const POST = withApiPermission(
  'manage',
  MANAGE_ORGANIZATION_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = organizationLogoSetSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await setOrganizationLogo(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      parsed.data.path,
    )
    return Response.json({ data })
  },
)

export const DELETE = withApiPermission(
  'manage',
  MANAGE_ORGANIZATION_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = organizationLogoRemoveSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await removeOrganizationLogo({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason })
    return Response.json({ data })
  },
)
