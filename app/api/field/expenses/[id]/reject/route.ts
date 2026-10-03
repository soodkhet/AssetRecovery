import type { NextRequest } from 'next/server'
import { bodyStringField, readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { rejectFieldExpense } from '@/lib/field/expense-queries'
import { assertRejectReason } from '@/lib/field/expense-status'
import { rejectExpenseSchema } from '@/lib/field/schemas'
import type { FieldExpenseDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/expenses/:id/reject` (`41` §8 `reject_expense`)
 *
 * **ผู้อนุมัติจ่ายเท่านั้น** (บัญชี/การเงิน ไฟล์ 16/17) — ตีกลับได้จากทุกขั้นอนุมัติ (`23` §6.3)
 * จึงรับ capability ของทุกขั้นในสายอนุมัติ (`16` §6.1 — สายเกินเพดานมีขั้น Executive ด้วย) · Field Agent ไม่มีสิทธิ์นี้
 * ⚠️ แตะแค่ `expense.status` — **ไม่กระทบ `assignment_status` ของเคส** (`41` §10.1 · §20)
 */
export const POST = withEndpoint<RouteContext, FieldExpenseDto>({
  endpoint: 'field.rejectExpense',
  action: 'manage',
  resource: APPROVAL_STEP_CAPABILITIES,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    const parsed = rejectExpenseSchema.safeParse(body)
    if (!parsed.success) {
      // ไม่มี/สั้นเกิน ⇒ `REJECT_REASON_REQUIRED` (`24`) ไม่ใช่ `REQUIRED_MISSING` (UAT R6-D)
      assertRejectReason(bodyStringField(body, 'reason'))
      return validationErrorResponse(parsed.error)
    }

    const data = await rejectFieldExpense(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
