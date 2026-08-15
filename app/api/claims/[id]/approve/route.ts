import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { approveCompensationExpense } from '@/lib/compensation/approval-queries'
import { compensationApproveSchema } from '@/lib/compensation/approval-types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/claims/:id/approve` (`15` §14 · `27` §6.4)
 *
 * **สายอนุมัติมีชุดเดียว** (`15` §4 — รายละเอียดอยู่ไฟล์ 16) ⇒ เส้นนี้เป็นชื่อเรียกอีกชื่อของ
 * `PATCH /api/compensation/:id/approve` ตัวเดิม ห้ามเขียนตรรกะ multi-step ซ้ำ
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = compensationApproveSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await approveCompensationExpense({ actor: user, meta: getRequestMeta(request) }, id, parsed.data)
    return apiSuccess(result)
  },
)
