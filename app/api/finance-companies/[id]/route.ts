import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getFinanceCompany, updateFinanceCompany } from '@/lib/finance-companies/queries'
import { financeCompanyUpdateSchema } from '@/lib/finance-companies/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET /api/finance-companies/:id` — รายละเอียดบริษัทเดียว (404 แบบไม่ leak ข้ามองค์กร) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getFinanceCompany(user, id) })
  },
)

/**
 * `PATCH /api/finance-companies/:id` (`10` §14) — แก้ข้อมูลบริษัททั้งชุด
 * การเปลี่ยน `service_fee_template_id` กระทบเฉพาะเคสที่ยัง**ไม่** approved (`10` §9.2 — เคสที่
 * approved แล้วใช้ตัวเลขที่ snapshot ไว้ที่ตัวเคส) · เปลี่ยนสถานะใช้ `POST /:id/status`
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_companies',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = financeCompanyUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getFinanceCompany(user, id)
    const { reason, ...values } = parsed.data

    const company = await updateFinanceCompany(
      { actor: user, meta: getRequestMeta(request), reason },
      current,
      values,
    )

    return Response.json({ data: company })
  },
)
