import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getFinanceCompany, listCompanyUsers } from '@/lib/finance-companies/queries'
import { createUser } from '@/lib/users/queries'
import { companyUserCreateSchema } from '@/lib/users/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/finance-companies/:id/users` (`10` §14) — บัญชีผู้ใช้ฝั่งบริษัท
 *
 * scope: company user เห็นได้เฉพาะบริษัทตัวเอง — ตรวจใน `getFinanceCompany()` (403 ถ้าข้ามบริษัท)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await listCompanyUsers(user, id) })
  },
)

/**
 * `POST /api/finance-companies/:id/users` (`10` §14) — สร้างบัญชีผู้ใช้ของบริษัทไฟแนนซ์
 * (เลื่อนมาจาก Phase 1.8 เพราะต้องใช้กติกาผู้ใช้ของไฟล์ 08)
 *
 * `company_id` มาจาก path เสมอ ไม่รับจาก body — และบริษัทนั้นต้องอยู่ใน scope ของผู้เรียก
 * (`getFinanceCompany()` โยน 403/404 ให้เอง) · role ที่เลือกต้องอยู่ในกลุ่ม `finance_company`
 * ไม่งั้น `INVALID_USER_SCOPE` (`08` §7.1)
 *
 * เหมือน `POST /api/users` — ผู้ดูแลตั้งรหัสผ่านเริ่มต้นให้ในฟอร์ม ผู้ใช้ต้องเปลี่ยนเองตอน login ครั้งแรก (มติ PO 03/10/2569)
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = companyUserCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const company = await getFinanceCompany(user, id)
    const { password, confirmPassword: _confirm, ...values } = parsed.data

    const result = await createUser(
      { actor: user, meta: getRequestMeta(request), reason: null },
      { ...values, teamId: null, companyId: company.id },
      password,
    )

    return Response.json(
      result.warning === null ? { data: result.user } : { data: result.user, warning: result.warning },
      { status: 201 },
    )
  },
)
