import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { BILLING_READ_CAPABILITIES, listRevenues } from '@/lib/revenue/queries'
import { revenueListQuerySchema } from '@/lib/revenue/schemas'

/**
 * รายการรายได้ดิบ (`19` §8 ตารางล่าง · §14 · `27` §6.7) — `GET /api/revenues`
 *
 * อ่านอย่างเดียวเสมอ: **ไม่มี endpoint สร้าง/แก้ Revenue** — เกิดจาก `tryCreateRevenue()` ตาม
 * เกตของ `19` §6.1 และแก้ยอดต้องผ่าน Adjustment (ไฟล์ 20 · `EDIT_BILLED_REVENUE`)
 * Company User เห็นเฉพาะบริษัทตัวเองผ่าน scope ระดับแถว (`25` §7)
 */
export const GET = withApiPermission(
  'view',
  BILLING_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = revenueListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listRevenues(user, parsed.data))
  },
)
