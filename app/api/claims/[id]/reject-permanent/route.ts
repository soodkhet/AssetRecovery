import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import {
  bodyStringField,
  readJsonBody,
  toModuleErrorResponse,
  validationErrorResponse,
  withApiPermission,
} from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { rejectExpensePermanently } from '@/lib/compensation/approval-queries'
import { compensationRejectSchema } from '@/lib/compensation/approval-types'
import { assertRejectReason } from '@/lib/field/expense-status'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/claims/:id/reject-permanent` (มติ PO 06/10/2569 U117 ข้อ 3) = `reject_permanent` ของ `23` §6.3
 * (`pending_approval → rejected` terminal) — เฉพาะใบเบิกค่าที่พัก · เหตุผลบังคับ (`REJECT_REASON_REQUIRED`)
 * · สิทธิ์/scope/ขั้นที่รออยู่ชุดเดียวกับการตีกลับ (`/api/claims/:id/reject`)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    const parsed = compensationRejectSchema.safeParse(body)
    if (!parsed.success) {
      assertRejectReason(bodyStringField(body, 'reason'))
      return validationErrorResponse(parsed.error)
    }

    const result = await rejectExpensePermanently({ actor: user, meta: getRequestMeta(request) }, id, parsed.data)
    return apiSuccess(result)
  },
)
