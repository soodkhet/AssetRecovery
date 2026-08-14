import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { toServiceFeeErrorResponse } from '@/lib/service-fee/errors'
import { createServiceFeeTemplate, listServiceFeeTemplates } from '@/lib/service-fee/queries'
import {
  serviceFeeTemplateCreateSchema,
  serviceFeeTemplateListQuerySchema,
} from '@/lib/service-fee/schemas'

/**
 * `GET /api/service-fee-templates` (`12` §14) — เวอร์ชันปัจจุบันของทุกเทมเพลต
 * สิทธิ์: `view:view_master_data` — การเงิน/บัญชีดูได้อย่างเดียว (`12` §12 · `25` §7.1)
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toServiceFeeErrorResponse,
  async (request: NextRequest, _context, user) => {
    const url = new URL(request.url)
    const parsed = serviceFeeTemplateListQuerySchema.safeParse({
      model: url.searchParams.get('model') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    })
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return Response.json({ data: await listServiceFeeTemplates(user.organizationId, parsed.data) })
  },
)

/**
 * `POST /api/service-fee-templates` — สร้างเทมเพลตใหม่ (เวอร์ชัน 1)
 * สิทธิ์: `manage:manage_service_fees` = **Superadmin เท่านั้น** (`12` §12 · `25` §16.1 "✅ only")
 */
export const POST = withApiPermission(
  'manage',
  'manage_service_fees',
  toServiceFeeErrorResponse,
  async (request: NextRequest, _context, user) => {
    const parsed = serviceFeeTemplateCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const template = await createServiceFeeTemplate(
      { actor: user, meta: getRequestMeta(request), reason },
      values,
    )

    return Response.json({ data: template }, { status: 201 })
  },
)
