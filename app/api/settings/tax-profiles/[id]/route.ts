import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteTaxProfile, getTaxProfile, updateTaxProfile } from '@/lib/settings/queries/tax-profiles'
import { taxProfileDeleteSchema, taxProfileUpdateSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET/PATCH/DELETE /api/settings/tax-profiles/:id` (`13` §6.4) — แก้ต้อง audit + reason เสมอ (`13` §9) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getTaxProfile(user.organizationId, id) })
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_tax_profiles',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = taxProfileUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getTaxProfile(user.organizationId, id)
    const { reason, ...values } = parsed.data
    const profile = await updateTaxProfile({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: profile })
  },
)

/** profile ที่ผูกกับ payee/รายการจ่ายแล้วลบไม่ได้ → `TAX_PROFILE_IN_USE` (ยอดภาษีเดิมต้องอ้างอิงได้) */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_tax_profiles',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = taxProfileDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getTaxProfile(user.organizationId, id)
    const profile = await deleteTaxProfile(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
    )
    return Response.json({ data: profile })
  },
)
