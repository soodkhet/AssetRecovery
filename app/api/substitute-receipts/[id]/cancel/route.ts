import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { cancelSubstituteReceipt, SUBSTITUTE_RECEIPT_CAPABILITIES } from '@/lib/substitute-receipts/queries'
import { substituteReceiptCancelSchema } from '@/lib/substitute-receipts/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/substitute-receipts/:id/cancel` (มติ PO U107) — ยกเลิกใบรับรองแทนใบเสร็จรับเงิน
 *
 * เหตุผลบังคับ (`CANCEL_REQUIRES_REASON`) · ยกเลิกได้ครั้งเดียว · ใบเดิมเก็บไว้ (ห้ามลบ) PDF พิมพ์ป้าย "ยกเลิก"
 * สิทธิ์ระดับแถว (เจ้าของก่อนอนุมัติ / การเงิน / Superadmin) ตรวจที่ชั้นข้อมูล — นอก scope 404
 * ใบเบิกที่อนุมัติจ่ายแล้ว ⇒ `SUBSTITUTE_RECEIPT_NOT_CANCELLABLE`
 */
export const POST = withApiPermission<RouteContext>(
  'view',
  SUBSTITUTE_RECEIPT_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = substituteReceiptCancelSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await cancelSubstituteReceipt({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
