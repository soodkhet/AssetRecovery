import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { BILLING_READ_CAPABILITIES, getArAging } from '@/lib/revenue/queries'
import { arAgingQuerySchema } from '@/lib/revenue/schemas'

/**
 * `GET /api/ar-aging` (`19` §6.4/§14 · `22` §6.11) — ยอดค้างรับแยกตามช่วงอายุหนี้
 *
 * ช่วงอายุหนี้มาจาก `finance_policy_settings.ar_aging_buckets` (`13` §6.2.1) **ห้าม hardcode**
 * นับอายุจาก `due_date` ของรอบวางบิลตามปฏิทินไทย · บิลที่ยัง `draft` ไม่นับเป็นลูกหนี้
 */
export const GET = withApiPermission(
  'view',
  BILLING_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = arAgingQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await getArAging(user, parsed.data))
  },
)
