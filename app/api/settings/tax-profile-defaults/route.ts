import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createTaxProfileDefaults, getTaxProfileDefaultsOverview } from '@/lib/settings/queries/tax-profile-defaults'
import { taxProfileDefaultsCreateSchema } from '@/lib/settings/schemas'

/**
 * Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (มติ PO 06/10/2569 U121 · `13` §6.4.3) —
 * `GET`/`POST /api/settings/tax-profile-defaults`
 *
 * - `GET` = ชุดที่มีผล + ประวัติ · อ่านด้วย `view_master_data` (แนวเดียวกับรายการ Tax Profile)
 * - `POST` = บันทึกชุดใหม่ (insert-only ไม่มี PATCH/DELETE) · `manage_tax_profiles` (ล็อก Superadmin —
 *   `lib/roles/capability-locks.ts`) · เหตุผลบังคับ (กระทบภาษี)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) =>
    Response.json({ data: await getTaxProfileDefaultsOverview(user.organizationId) }),
)

export const POST = withApiPermission(
  'manage',
  'manage_tax_profiles',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = taxProfileDefaultsCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...slots } = parsed.data
    const created = await createTaxProfileDefaults({ actor: user, meta: getRequestMeta(request), reason }, slots)
    return Response.json({ data: created }, { status: 201 })
  },
)
