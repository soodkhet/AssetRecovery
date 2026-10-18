import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { BILLING_READ_CAPABILITIES, countUnbilledRevenuesByCompany } from '@/lib/revenue/queries'
import { revenueUnbilledCountsQuerySchema } from '@/lib/revenue/schemas'

/**
 * `GET /api/revenues/unbilled-counts?companyIds=a,b` — จำนวนรายได้รอวางบิลต่อบริษัท (อ่านอย่างเดียว)
 * สิทธิ์เดียวกับ `GET /api/revenues` · ฟอร์มสร้างรอบวางบิลใช้ตัดสินว่าบริษัทที่ระงับรายไหนยังวางบิลได้ (มติ D7-05)
 */
export const GET = withApiPermission(
  'view',
  BILLING_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = revenueUnbilledCountsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await countUnbilledRevenuesByCompany(user, parsed.data.companyIds))
  },
)
