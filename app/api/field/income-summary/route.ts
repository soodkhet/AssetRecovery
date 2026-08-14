import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getIncomeSummary } from '@/lib/field/expense-queries'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { incomeSummaryQuerySchema } from '@/lib/field/schemas'
import type { FieldIncomeSummaryDto } from '@/lib/field/types'

/**
 * `GET /api/field/income-summary?month=YYYY-MM` (`41` §7.10)
 * ไม่ระบุเดือน = สะสมตลอด · ยอดต่อเคสมาจากแผนที่ snapshot ไว้ (`22` §6.4) ไม่ใช่แผนปัจจุบัน
 */
export const GET = withEndpoint<unknown, FieldIncomeSummaryDto>({
  endpoint: 'field.incomeSummary',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const month = new URL(request.url).searchParams.get('month')
    const parsed = incomeSummaryQuerySchema.safeParse(month === null ? {} : { month })
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await getIncomeSummary(user, parsed.data)
    return { data }
  },
})
