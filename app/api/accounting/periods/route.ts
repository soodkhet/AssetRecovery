import type { NextRequest } from 'next/server'
import { PERIOD_READ_CAPABILITIES } from '@/lib/accounting/period'
import { listPeriods } from '@/lib/accounting/queries'
import { periodListQuerySchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'

/**
 * `GET /api/accounting/periods` (`30` §14 · `27` §6.16) — ตารางรอบบัญชี
 *
 * ⚠️ endpoint นี้ **เปิดรอบของเดือนที่ยังไม่มีให้ก่อน** (`30` §9 "เดือนใหม่เริ่มต้น → collecting")
 *    การเปิดรอบเป็น mutation ที่ลง audit ครบ ไม่ใช่ผลข้างเคียงเงียบ ๆ
 * ยอด critical/warning เป็น **derived** นับสดจาก `exceptions` ทุกครั้ง (`30` §7.1)
 */
export const GET = withApiPermission(
  'view',
  PERIOD_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = periodListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listPeriods({ actor: user, meta: getRequestMeta(request) }, parsed.data))
  },
)
