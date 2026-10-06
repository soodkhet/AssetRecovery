import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { reissueSubstituteReceipt, SUBSTITUTE_RECEIPT_CAPABILITIES } from '@/lib/substitute-receipts/queries'
import { substituteReceiptReissueSchema } from '@/lib/substitute-receipts/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/substitute-receipts/:id/reissue` (มติ PO U107) — ออกใบรับรองแทนใบเสร็จใหม่ (เลข CRT ใหม่) แทนใบ `:id`
 * ที่ยกเลิกแล้ว ผูกกับใบเบิก/เงินทดรองเดิม · สิทธิ์เดียวกับการยกเลิก · เพดานตรวจใหม่ · นอก scope 404
 */
export const POST = withApiPermission<RouteContext>(
  'view',
  SUBSTITUTE_RECEIPT_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = substituteReceiptReissueSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const receipt = await reissueSubstituteReceipt({ actor: user, meta: getRequestMeta(request) }, id, parsed.data.lines)
    return apiSuccess(receipt, { status: 201 })
  },
)
