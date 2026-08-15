import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listCashReceipts } from '@/lib/sales/queries'
import { SALES_READ_CAPABILITIES } from '@/lib/sales/sales'
import { cashReceiptListQuerySchema } from '@/lib/sales/schemas'

/**
 * `GET /api/accounting/cash-receipts` (`31` §14) — แท็บ "เงินรับ" **อ่านอย่างเดียว**
 *
 * ⚠️ ไม่มี POST โดยเจตนา — เงินรับสร้างได้จากการกระทบยอดธนาคารเท่านั้น (`31` §6.3/§10 · ไฟล์ 35)
 *    เพื่อไม่ให้ยอดในระบบต่างจากเงินที่เข้าบัญชีจริง
 */
export const GET = withApiPermission(
  'view',
  SALES_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = cashReceiptListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listCashReceipts(user, parsed.data))
  },
)
