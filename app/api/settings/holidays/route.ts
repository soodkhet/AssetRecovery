import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createHoliday, listHolidays } from '@/lib/settings/queries/holidays'
import { holidayCreateSchema, holidayListQuerySchema } from '@/lib/settings/schemas'

/**
 * ปฏิทินวันหยุด (มติ PO 06/10/2569 UAT U93 · `13` §6.15 · `25` §7.1) — `GET`/`POST /api/settings/holidays`
 * อ่าน = `manage_holidays` ระดับ view (บริหาร/ธุรการ/บัญชี/การเงิน) · เพิ่ม = manage + เหตุผล
 * การเพิ่มคิดกำหนดยื่น ภ.ง.ด. ของรอบที่ยังไม่ยื่นใหม่ในทรานแซกชันเดียวกัน
 */

const MANAGE_HOLIDAYS = 'manage_holidays'

export const GET = withApiPermission(
  'view',
  MANAGE_HOLIDAYS,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = holidayListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listHolidays(user.organizationId, parsed.data.yearBe) })
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_HOLIDAYS,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = holidayCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const result = await createHoliday({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: result }, { status: 201 })
  },
)
