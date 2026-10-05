import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { requirePayoutCancelReason } from '@/lib/payout/payout'
import { cancelPayoutBatch, MANAGE_PAYOUT_BATCH } from '@/lib/payout/queries'
import { payoutCancelSchema } from '@/lib/payout/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/payout-batches/:id/cancel` (มติ PO U67 · `23` §6.6 · `27` §6.6)
 * ยกเลิกรอบจ่ายก่อนโอนจริง — สิทธิ์เดียวกับจัดการรอบจ่าย (`25` §7.2 "จัดการ Payout Batch" = การเงิน)
 * เหตุผลบังคับ (`CANCEL_REQUIRES_REASON`) · รอบที่สร้างไฟล์โอนแล้วต้องยืนยันว่ายังไม่ส่งไฟล์เข้าธนาคาร
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = payoutCancelSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    // ปฏิเสธตั้งแต่หน้าประตู (service ตรวจซ้ำในตัวเอง) — ไม่มีเหตุผล = `CANCEL_REQUIRES_REASON` 400
    requirePayoutCancelReason(parsed.data.reason)

    return apiSuccess(await cancelPayoutBatch({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
