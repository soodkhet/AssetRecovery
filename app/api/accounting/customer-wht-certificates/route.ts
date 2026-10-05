import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { MANAGE_CUSTOMER_WHT } from '@/lib/customer-wht/customer-wht'
import { listCustomerWht } from '@/lib/customer-wht/queries'
import { customerWhtListQuerySchema } from '@/lib/customer-wht/schemas'

/**
 * `GET /api/accounting/customer-wht-certificates` (มติ PO 05/10/2569 U40)
 * รายการ 50 ทวิ ที่ลูกค้าหักเรา (ค้างรับ/ได้รับแล้ว) — กรองลูกค้า/สถานะ/อายุค้าง
 * อ่าน = ธุรการ/การเงิน/บัญชี (จัดการ) + บริหาร (ดู)
 */
export const GET = withApiPermission(
  'view',
  MANAGE_CUSTOMER_WHT,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = customerWhtListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listCustomerWht(user, parsed.data))
  },
)
