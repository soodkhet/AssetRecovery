import type { NextRequest } from 'next/server'
import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { backdatedFuelExpenseSchema } from '@/lib/field/backdated-schemas'
import { createBackdatedFuelExpense } from '@/lib/field/fuel-distance-job'

/**
 * `POST /api/adjustments/fuel-expenses/backdated` (มติ PO U135 · `41` §6.6 · `27` §6.8)
 * สร้างรายการค่าน้ำมันตามระยะทาง (ยอดที่ job คำนวณเก็บไว้) ลงวันที่ในงวดที่เปิดอยู่ → สายอนุมัติปกติ
 * เหตุผลบังคับ + audit · idempotent (รอบนี้มีรายการค่าน้ำมันแล้ว = 200 `created: false`)
 *
 * สิทธิ์ = `create_adjustment` (การเงิน — `25` §7.4)
 */
export const POST = withApiPermission(
  'manage',
  CREATE_ADJUSTMENT,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = backdatedFuelExpenseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const result = await createBackdatedFuelExpense({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(result, { status: result.created ? 201 : 200 })
  },
)
