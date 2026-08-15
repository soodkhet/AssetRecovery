import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { rejectCompensationExpense } from '@/lib/compensation/approval-queries'
import { compensationRejectSchema } from '@/lib/compensation/approval-types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/claims/:id/reject` (`15` §14 · `27` §6.4) = `reject_expense` ของไฟล์ 41/16
 *
 * ⚠️ **ไม่ใช่ `reject_evidence`** (`16` §6.2 · `41` §10.1) — ที่นี่แตะแค่ `expense.status`
 * และตีกลับ = กลับขั้น 1 เสมอ (ตรรกะเดียวกับ `/api/compensation/:id/reject` ห้ามเขียนซ้ำ)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = compensationRejectSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await rejectCompensationExpense({ actor: user, meta: getRequestMeta(request) }, id, parsed.data)
    return apiSuccess(result)
  },
)
