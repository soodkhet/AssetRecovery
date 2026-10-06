import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { getSubstituteReceiptDetail, SUBSTITUTE_RECEIPT_CAPABILITIES } from '@/lib/substitute-receipts/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/substitute-receipts/:id` (มติ PO 06/10/2569 U117 ข้อ 1) — รายละเอียด + บรรทัดของใบ
 * ให้ฟอร์ม "ออกใบใหม่แทน" ตั้งต้นจากใบที่ยกเลิก · สิทธิ์/scope เดียวกับการดาวน์โหลด PDF (นอก scope 404)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  SUBSTITUTE_RECEIPT_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return apiSuccess(await getSubstituteReceiptDetail(user, id))
  },
)
