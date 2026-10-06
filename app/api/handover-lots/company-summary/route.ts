import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { WAREHOUSE_READ_CAPABILITIES } from '@/lib/warehouse/permissions'
import { summarizeLotsByCompany } from '@/lib/warehouse/queries'
import { lotCompanySummaryQuerySchema } from '@/lib/warehouse/schemas'
import type { LotCompanySummaryDto } from '@/lib/warehouse/types'

/**
 * `GET /api/handover-lots/company-summary` (มติ PO U142 · `44` §8.5 · `45` §6.5)
 * แถวหัวกลุ่มต่อบริษัทของแท็บ "ส่งมอบแล้ว" — สิทธิ์ชุดเดียวกับ `GET /api/handover-lots`
 * และ scope ระดับแถวเดียวกัน (Company User เห็นเฉพาะบริษัทตัวเอง · ทีมเห็นเฉพาะเครื่องของทีม)
 */
export const GET = withEndpoint<unknown, LotCompanySummaryDto>({
  endpoint: 'lot.companySummary',
  action: 'view',
  resource: WAREHOUSE_READ_CAPABILITIES,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = lotCompanySummaryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await summarizeLotsByCompany(user, parsed.data) }
  },
})
