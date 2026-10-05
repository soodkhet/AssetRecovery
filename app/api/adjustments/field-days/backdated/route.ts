import type { NextRequest } from 'next/server'
import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createBackdatedFieldDayExpenses } from '@/lib/field/backdated-field-day'
import { backdatedFieldDaySchema } from '@/lib/field/backdated-schemas'

/**
 * `POST /api/adjustments/field-days/backdated` (มติ PO 05/10/2569 U50 · `41` §6.6 · `27` §6.8)
 * สร้างแถวรายวัน (ค่าน้ำมันเหมา/เบี้ยเลี้ยง) ของ (พนักงาน × วันลงพื้นที่ในงวดปิด) ลงวันที่ในงวดที่เปิดอยู่
 * → สายอนุมัติปกติ · เหตุผลบังคับ + audit · idempotent (สร้างแล้ว = 200 `created: false`)
 *
 * สิทธิ์ = `create_adjustment` (การเงิน — `25` §7.4)
 */
export const POST = withApiPermission(
  'manage',
  CREATE_ADJUSTMENT,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = backdatedFieldDaySchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const result = await createBackdatedFieldDayExpenses({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(result, { status: result.created ? 201 : 200 })
  },
)
