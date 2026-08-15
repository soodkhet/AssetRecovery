import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { assertNoAmountEdit, MAP_COST_CENTER } from '@/lib/expenses/expense-record'
import { mapExpenseCostCenter } from '@/lib/expenses/queries'
import { costCenterMapSchema } from '@/lib/expenses/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/expenses/:id/cost-center` (`32` §14)
 *
 * - แก้ได้เฉพาะรายการที่ map แบบ `manual` — `auto` ⇒ `COST_CENTER_AUTO_EDIT` (`32` §11)
 * - **ยอดเงินแก้ที่นี่ไม่ได้เด็ดขาด** — body ที่ส่ง `gross/wht/net` มาด้วยต้องได้
 *   `EDIT_AMOUNT_DIRECTLY` (ไม่ใช่ field error ของ Zod) แล้วไปใช้ Adjustment (ไฟล์ 20)
 * - `reason` บังคับเสมอ (`expense_records` = หมวด `money` ของ reason-policy · `32` §13)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MAP_COST_CENTER,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    assertNoAmountEdit(body)

    const parsed = costCenterMapSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(
      await mapExpenseCostCenter({ actor: user, meta: getRequestMeta(request) }, id, parsed.data),
    )
  },
)
