import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createWhtPolicy, getWhtPolicyOverview } from '@/lib/settings/queries/wht-policy'
import { whtPolicyCreateSchema } from '@/lib/settings/schemas'

/**
 * ค่าตั้งภาษีหัก ณ ที่จ่าย (มติ PO 05/10/2569 UAT U3/U4/U5/U8 · `13` §6.4.2) — `GET`/`POST /api/settings/wht-policy`
 *
 * - `GET` = ค่าที่มีผลวันนี้ + ประวัติ + ค่าเริ่มต้น · อ่านด้วย `view_master_data` (แนวเดียวกับอัตรา VAT)
 * - `POST` = เพิ่มค่าตั้งชุดใหม่พร้อมวันที่มีผล (insert-only ไม่มี PATCH/DELETE) · `manage_wht_policy`
 *   (Superadmin/บริหาร) · เหตุผลบังคับ · ย้อนหลังไม่ได้ (`WHT_POLICY_EFFECTIVE_DATE_PAST`)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) =>
    Response.json({ data: await getWhtPolicyOverview(user.organizationId) }),
)

export const POST = withApiPermission(
  'manage',
  'manage_wht_policy',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = whtPolicyCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const policy = await createWhtPolicy({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: policy }, { status: 201 })
  },
)
