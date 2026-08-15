import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getExceptions, REPORT_READ_CAPABILITIES } from '@/lib/reports/queries'
import { exceptionListQuerySchema } from '@/lib/reports/schemas'

/**
 * `GET /api/finance/exceptions` (`14` §14 · `27` §6.9) — รายการ Alert รวมทุกโมดูล
 *
 * **อ่านอย่างเดียว** — การจัดการ exception จริงอยู่ไฟล์ 34 (Phase 4.1) ห้ามเพิ่ม mutation ที่นี่
 * (`14` §4/§10 — หน้านี้แค่แสดงสรุปและลิงก์กลับต้นทาง)
 */
export const GET = withApiPermission(
  'view',
  REPORT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = exceptionListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await getExceptions(user, parsed.data))
  },
)
