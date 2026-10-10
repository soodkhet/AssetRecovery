import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { assertNoAmountEdit, MAP_COST_CENTER } from '@/lib/expenses/expense-record'
import { mapExpenseCostCenterBulk } from '@/lib/expenses/queries'
import { costCenterBulkMapSchema } from '@/lib/expenses/schemas'

/**
 * `POST /api/accounting/expenses/cost-center/bulk` (staging E-065 · `32` §14 · `27` §6.11)
 * map ศูนย์ต้นทุนหลายรายการด้วยเหตุผลเดียว — all-or-nothing · สิทธิ์/กติกาเดียวกับ map ทีละรายการ
 * (ยอดเงินแก้ไม่ได้ ⇒ `EDIT_AMOUNT_DIRECTLY` · auto ⇒ `COST_CENTER_AUTO_EDIT` · งวด locked ⇒ `PERIOD_LOCKED_DIRECT_EDIT`)
 */
export const POST = withApiPermission(
  'manage',
  MAP_COST_CENTER,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const body = await readJsonBody(request)
    assertNoAmountEdit(body)

    const parsed = costCenterBulkMapSchema.safeParse(body)
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await mapExpenseCostCenterBulk({ actor: user, meta: getRequestMeta(request) }, parsed.data))
  },
)
