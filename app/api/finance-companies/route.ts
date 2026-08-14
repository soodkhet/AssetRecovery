import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createFinanceCompany, listFinanceCompanies } from '@/lib/finance-companies/queries'
import { financeCompanyCreateSchema, financeCompanyListQuerySchema } from '@/lib/finance-companies/schemas'

/**
 * `GET /api/finance-companies` (`10` §14) — รายการบริษัท + filter `status`/`search` (ชื่อหรือ tax id)
 * สิทธิ์: `view:view_master_data` — การเงิน/บัญชี/ผู้จัดการดูได้อย่างเดียว (`10` §12)
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context, user) => {
    const url = new URL(request.url)
    const parsed = financeCompanyListQuerySchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    })
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return Response.json({ data: await listFinanceCompanies(user, parsed.data) })
  },
)

/**
 * `POST /api/finance-companies` — สร้างบริษัทใหม่ · `tax_id` ต้องไม่ซ้ำ (`DUPLICATE_TAX_ID`)
 * และต้องผูกเทมเพลตค่าบริการเสมอ (`10` §9.1) · สิทธิ์: `manage:manage_companies` (Superadmin — `10` §12)
 */
export const POST = withApiPermission(
  'manage',
  'manage_companies',
  toModuleErrorResponse,
  async (request: NextRequest, _context, user) => {
    const parsed = financeCompanyCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const company = await createFinanceCompany({ actor: user, meta: getRequestMeta(request), reason }, values)

    return Response.json({ data: company }, { status: 201 })
  },
)
