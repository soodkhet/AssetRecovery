import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getVatRate, updateVatRate } from '@/lib/settings/queries/vat-rates'
import { vatRateUpdateSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET/PATCH /api/settings/vat-rates/:id` (`13` §6.5)
 *
 * **ไม่มี DELETE**: `vat_rate_history` ไม่มี `deleted_at` (`02` §2.4 — ตาราง insert-only ด้านคอลัมน์)
 * ต้องการหยุดใช้อัตราให้ **ปิดช่วง** ด้วย `effectiveTo` แทน · ทุกการแก้ต้องมี `reason` (`13` §12)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getVatRate(user.organizationId, id) })
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_tax_profiles',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = vatRateUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getVatRate(user.organizationId, id)
    const { reason, ...values } = parsed.data
    const rate = await updateVatRate({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: rate })
  },
)
