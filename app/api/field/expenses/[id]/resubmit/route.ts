import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { resubmitFieldExpense } from '@/lib/field/expense-queries'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { resubmitExpenseSchema } from '@/lib/field/schemas'
import type { FieldExpenseDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/field/expenses/:id/resubmit` (`41` §8 `resubmit_expense`)
 *
 * **เจ้าของรายการเท่านั้น** — ผู้จัดการ/หัวหน้าทีมแก้แทนไม่ได้ (`41` §6.6 · §20)
 * บังคับที่ชั้น service ด้วยการกรอง `payee` ของผู้เรียก ⇒ ของคนอื่นตอบ `EXPENSE_NOT_FOUND`
 */
export const POST = withEndpoint<RouteContext, FieldExpenseDto>({
  endpoint: 'field.resubmitExpense',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = resubmitExpenseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await resubmitFieldExpense(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
