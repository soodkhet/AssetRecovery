import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listWhtFilingSummaries } from '@/lib/wht/queries'
import { whtFilingSummaryListQuerySchema } from '@/lib/wht/schemas'
import { WHT_READ_CAPABILITIES } from '@/lib/wht/wht'

/**
 * `GET /api/accounting/wht-filing-summary` (`33` §14 · `27` §6.12) — สรุปรอบนำส่ง ภ.ง.ด.3/53
 *
 * รอบที่เลยกำหนดแล้วยังไม่ยื่นส่ง `FILING_OVERDUE_WARNING` กลับใน `warning` ของ envelope —
 * **เตือน ไม่ block** (`33` §11 · Rule 04 warn-only) ⇒ ยัง 200 เสมอ
 */
export const GET = withApiPermission(
  'view',
  WHT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = whtFilingSummaryListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await listWhtFilingSummaries(user, parsed.data)
    return apiSuccess(data, { warning: data.warning ?? undefined })
  },
)
