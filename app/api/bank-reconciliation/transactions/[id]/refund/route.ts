import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import {
  bodyStringField,
  readJsonBody,
  toModuleErrorResponse,
  validationErrorResponse,
  withApiPermission,
} from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { BankReconError } from '@/lib/bank-recon/errors'
import { MANAGE_BANK_RECONCILIATION, refundSuspense } from '@/lib/bank-recon/queries'
import { refundSuspenseSchema } from '@/lib/bank-recon/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/refund` (มติ PO 05/10/2569 U41)
 *
 * คืนเงินรับรอตรวจสอบให้ผู้โอน — วันที่ + หลักฐาน (อัปโหลดผ่าน server ก่อน) + เหตุผล · สถานะสุดท้าย
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    const parsed = refundSuspenseSchema.safeParse(body)
    if (!parsed.success) {
      if ((bodyStringField(body, 'reason') ?? '').trim() === '') throw new BankReconError('MATCH_NOTE_REQUIRED')
      return validationErrorResponse(parsed.error)
    }
    return apiSuccess(await refundSuspense({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
