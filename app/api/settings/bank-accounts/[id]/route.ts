import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteBankAccount, getBankAccount, updateBankAccount } from '@/lib/settings/queries/bank-accounts'
import { bankAccountDeleteSchema, bankAccountUpdateSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET/PATCH/DELETE /api/settings/bank-accounts/:id` (`13` §6.3) */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await getBankAccount(user.organizationId, id) })
  },
)

export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = bankAccountUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getBankAccount(user.organizationId, id)
    const { reason, ...values } = parsed.data
    const account = await updateBankAccount({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: account })
  },
)

/**
 * ปิดใช้งานบัญชี — **บัญชีที่มีรายการเงินผูกอยู่ปิดไม่ได้** → `BANK_ACCOUNT_IN_USE` (`13` §9)
 * ต้องการหยุดใช้บัญชีบางทางให้เปลี่ยน `usage` แทน
 */
export const DELETE = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = bankAccountDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getBankAccount(user.organizationId, id)
    const account = await deleteBankAccount(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
    )
    return Response.json({ data: account })
  },
)
