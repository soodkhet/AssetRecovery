import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createPayee, listPayees, MANAGE_PAYEE_PROFILE } from '@/lib/payees/queries'
import { payeeCreateSchema, payeeListQuerySchema } from '@/lib/payees/schemas'

/**
 * ผู้รับเงิน (`18` §14 · `27` §6.3) — `GET`/`POST /api/payees`
 *
 * อ่าน = `view:manage_payee_profile` — พนักงานภาคสนามถือสิทธิ์ระดับ `view` จึงเห็น**เฉพาะของตัวเอง**
 * (กรอง scope ระดับแถวในชั้นข้อมูล — `18` §12 · `25` §7.2) · แก้ = `manage` (การเงิน)
 */

export const GET = withApiPermission(
  'view',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = payeeListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listPayees(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = payeeCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const result = await createPayee({ actor: user, meta: getRequestMeta(request), reason }, values)
    return apiSuccess(result.payee, { status: 201, warning: result.warning })
  },
)
