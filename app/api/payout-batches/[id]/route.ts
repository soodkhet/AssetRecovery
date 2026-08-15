import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { getPayoutBatch, MANAGE_PAYOUT_BATCH } from '@/lib/payout/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/payout-batches/:id` (`27` §6.6 v3.2) — รายละเอียดรอบจ่าย + รายการในรอบ
 * ใช้กับปุ่ม "ดู" ของตารางรอบจ่าย (`17` §8) และหน้าจอตรวจยอดก่อนสร้างไฟล์โอน
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return apiSuccess(await getPayoutBatch(user, id))
  },
)
