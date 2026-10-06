import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { attachSignedSubstituteReceipt, SUBSTITUTE_RECEIPT_CAPABILITIES } from '@/lib/substitute-receipts/queries'
import { substituteReceiptSignedSchema } from '@/lib/substitute-receipts/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/substitute-receipts/:id/signed` (มติ PO U103) — ผูกไฟล์ใบรับรองแทนใบเสร็จ **ฉบับเซ็นแล้ว**
 * (path จาก `/api/storage/upload-url` target `substitute_receipt` · server ตรวจไฟล์ + SHA-256)
 *
 * เจ้าของใบ (ผู้จ่ายเงิน) หรือการเงินที่เห็นทั้งองค์กร — ผู้จัดการทีมอัปโหลดแทนไม่ได้ · นอก scope 404
 * ใบที่ผูกใบเบิก ⇒ ไฟล์นี้กลายเป็นใบเสร็จของใบเบิก (ปลดยามอนุมัติ `SUBSTITUTE_RECEIPT_NOT_SIGNED`)
 */
export const POST = withApiPermission<RouteContext>(
  'view',
  SUBSTITUTE_RECEIPT_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = substituteReceiptSignedSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await attachSignedSubstituteReceipt({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
