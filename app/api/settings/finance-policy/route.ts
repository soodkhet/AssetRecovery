import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getFinancePolicy, updateFinancePolicy } from '@/lib/settings/queries/finance-policy'
import { financePolicyUpdateSchema } from '@/lib/settings/schemas'

/**
 * นโยบายการเงินระดับองค์กร (`13` §6.2.1 · DEC-006/D1) — **endpoint ที่ `13` §13 ตกหล่น**
 * (ตาราง API draft ของ `13` มีแค่ `approval-matrix` ซึ่งย้ายค่านโยบายออกไปแล้วตั้งแต่ 04/07/2569)
 *
 * 1 record ต่อองค์กร ⇒ ไม่มี POST/DELETE · เงินเป็น satang (Rule 01) · `reason` บังคับ
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getFinancePolicy(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = financePolicyUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getFinancePolicy(user.organizationId)
    const { reason, ...values } = parsed.data
    const policy = await updateFinancePolicy({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: policy })
  },
)
