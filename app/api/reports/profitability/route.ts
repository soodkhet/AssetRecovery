import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getProfitability, REPORT_READ_CAPABILITIES } from '@/lib/reports/queries'
import { profitabilityQuerySchema } from '@/lib/reports/schemas'

/**
 * `GET /api/reports/profitability` (`21` §14 · `27` §6.9) — รายงานกำไรขั้นต้นตามมิติ/ช่วงเวลา
 *
 * read-only ทั้งหมด (`21` §10) ⇒ ไม่มี audit · สิทธิ์ = การเงิน/บัญชี/ผู้บริหาร (`25` §7.6)
 * `?refresh=true` = ปุ่ม "รีเฟรชตอนนี้" ข้ามแคชรายวัน (`21` §17)
 */
export const GET = withApiPermission(
  'view',
  REPORT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = profitabilityQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await getProfitability(user, parsed.data))
  },
)
