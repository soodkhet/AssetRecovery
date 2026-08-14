import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { rejectCompensationExpense } from '@/lib/compensation/approval-queries'
import { compensationRejectSchema } from '@/lib/compensation/approval-types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/compensation/:id/reject` (= `reject_expense` ของ `41` §8 · `16` §9/§14)
 *
 * ⚠️ **คนละสิทธิ์กับ `reject_evidence`** (`16` §6.2 · `41` §10.1): ที่นี่ตีกลับ "เอกสารบัญชี/ใบเสร็จ"
 * กระทบแค่ `expense.status` — ถ้าสงสัย **หลักฐานปิดงาน** ต้องให้เจ้าหน้าที่อนุมัติเคสใช้
 * `reject_evidence` แทน (capability คนละตัว endpoint คนละตัว)
 * · ตีกลับแล้ว **กลับไปขั้น 1 เสมอ** ไม่ resume ที่ขั้นที่ตีกลับ (`16` §9)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = compensationRejectSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await rejectCompensationExpense(
      { actor: user, meta: getRequestMeta(request) },
      id,
      parsed.data,
    )
    return apiSuccess(result)
  },
)
