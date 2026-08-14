import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { listFieldExpenses } from '@/lib/field/expense-queries'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { fieldExpenseListQuerySchema } from '@/lib/field/schemas'
import type { FieldExpenseListDto } from '@/lib/field/types'

/**
 * `GET /api/field/expenses?type=caseBound|separate` (`41` §7.9)
 * เห็นเฉพาะรายการของตัวเองเสมอ (กรองด้วย payee ของผู้เรียกในชั้น service)
 */
export const GET = withEndpoint<unknown, FieldExpenseListDto>({
  endpoint: 'field.expenseList',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const url = new URL(request.url)
    const parsed = fieldExpenseListQuerySchema.safeParse({
      ...(url.searchParams.get('type') === null ? {} : { type: url.searchParams.get('type') }),
    })
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await listFieldExpenses(user, parsed.data)
    return { data }
  },
})
