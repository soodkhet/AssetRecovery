import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_ORGANIZATION_PROFILE } from '@/lib/organization/permissions'
import { removeOrganizationSignature, setOrganizationSignature } from '@/lib/organization/queries'
import { organizationSignatureRemoveSchema, organizationSignatureSetSchema } from '@/lib/organization/schemas'

/**
 * รูปลายเซ็นผู้มีอำนาจ (มติ PO U122 · ไม่บังคับ) — `POST`/`DELETE /api/settings/organization/signature`
 *
 * - `POST { path, reason }` — ผูกไฟล์ที่อัปโหลดผ่าน `POST /api/storage/upload-url` (target `organization_signature`)
 *   server ตรวจ prefix ขององค์กร + ชนิดจากเนื้อไฟล์ (PNG/JPG) + ขนาด ≤ 1 MB + เก็บ SHA-256 ก่อนบันทึก
 * - `DELETE { reason }` — ปลดรูปลายเซ็น (ไฟล์เดิมยังอยู่ให้เอกสารที่ snapshot ไว้)
 * สิทธิ์ = `manage:manage_invoice_numbering` (Superadmin เท่านั้น — เดียวกับการแก้ข้อมูลองค์กร/โลโก้)
 * · จะพิมพ์บนเอกสารชนิดใดตั้งที่แท็บ "เทมเพลตเอกสาร"
 */

export const runtime = 'nodejs'

export const POST = withApiPermission(
  'manage',
  MANAGE_ORGANIZATION_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = organizationSignatureSetSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await setOrganizationSignature(
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
    const parsed = organizationSignatureRemoveSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await removeOrganizationSignature({
      actor: user,
      meta: getRequestMeta(request),
      reason: parsed.data.reason,
    })
    return Response.json({ data })
  },
)
