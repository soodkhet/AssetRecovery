import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createBankAccount, listBankAccounts } from '@/lib/settings/queries/bank-accounts'
import { bankAccountCreateSchema, bankAccountListQuerySchema } from '@/lib/settings/schemas'

/**
 * บัญชีธนาคารบริษัท (`13` §6.3 · §13) — `GET`/`POST /api/settings/bank-accounts`
 * ข้อมูลธนาคาร = หมวดอ่อนไหว ⇒ `reason` บังคับทุก mutation (`90` §13)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = bankAccountListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listBankAccounts(user.organizationId, parsed.data) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = bankAccountCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const account = await createBankAccount({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: account }, { status: 201 })
  },
)
