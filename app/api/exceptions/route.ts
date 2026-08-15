import type { NextRequest } from 'next/server'
import { EXCEPTION_READ_CAPABILITIES, MANAGE_EXCEPTIONS } from '@/lib/accounting/exception'
import { createException, listExceptions } from '@/lib/accounting/queries'
import { exceptionCreateSchema, exceptionListQuerySchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

/**
 * ข้อยกเว้น (`34` §14 · `27` §6.13) — `GET`/`POST /api/exceptions`
 *
 * อ่าน = บัญชี (manage) + การเงิน (view) + ผู้บริหาร · สร้าง/แก้ = บัญชีเท่านั้น (`25` §7.5)
 * ผลลัพธ์ของ `GET` พก summary ที่**แยก `authorized` ออกจาก `resolved`** มาด้วยเสมอ (`34` §6.3)
 */
export const GET = withApiPermission(
  'view',
  EXCEPTION_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = exceptionListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listExceptions(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_EXCEPTIONS,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = exceptionCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createException({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(created, { status: 201 })
  },
)
