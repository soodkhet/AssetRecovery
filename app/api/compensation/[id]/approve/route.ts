import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { approveCompensationExpense } from '@/lib/compensation/approval-queries'
import { compensationApproveSchema } from '@/lib/compensation/approval-types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/compensation/:id/approve` (`16` §9/§14 · `23` §6.5)
 *
 * ด่านแรกที่นี่แค่กรอง "เป็นผู้อนุมัติสักขั้นไหม" — ชั้นข้อมูลตรวจ capability **ของขั้นที่กำลังรอ**
 * ซ้ำอีกที (`16` §12) พร้อมยาม `APPROVAL_STEP_OUT_OF_ORDER` และ `SEGREGATION_OF_DUTIES_VIOLATION`
 * · ผ่านครบทุกขั้น ⇒ `approved` + event `expense.approved` ⇒ เช็คเกต Revenue ต่อ (`19` §6.1)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = compensationApproveSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await approveCompensationExpense(
      { actor: user, meta: getRequestMeta(request) },
      id,
      parsed.data,
    )
    return apiSuccess(result)
  },
)
