import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listSalesRecords } from '@/lib/sales/queries'
import { SALES_READ_CAPABILITIES } from '@/lib/sales/sales'
import { salesListQuerySchema } from '@/lib/sales/schemas'

/**
 * `GET /api/accounting/sales` (`31` §14) — แท็บ "รายได้และขาย"
 *
 * รายการขายเกิด**อัตโนมัติ**เมื่อรอบวางบิลถูกส่งบิล (`31` §6.1) ⇒ ไม่มี POST/PATCH/DELETE
 * ที่นี่โดยเจตนา · การเงิน/ผู้บริหารอ่านได้อย่างเดียว (`31` §12)
 */
export const GET = withApiPermission(
  'view',
  SALES_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = salesListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listSalesRecords(user, parsed.data))
  },
)
