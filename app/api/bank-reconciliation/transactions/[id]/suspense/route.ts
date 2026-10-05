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
import { MANAGE_BANK_RECONCILIATION, moveToSuspense } from '@/lib/bank-recon/queries'
import { moveToSuspenseSchema } from '@/lib/bank-recon/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/suspense` (มติ PO 05/10/2569 U41)
 *
 * เงินเข้าไม่ทราบที่มา ⇒ "เงินรับรอตรวจสอบ" — ไม่สร้างเงินรับ/ไม่ลด AR/ไม่รับรู้รายได้ · เหตุผลบังคับ
 * (ขาดเหตุผล ⇒ `MATCH_NOTE_REQUIRED` ตามทะเบียน ไม่ใช่ `REQUIRED_MISSING`)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    const parsed = moveToSuspenseSchema.safeParse(body)
    if (!parsed.success) {
      if ((bodyStringField(body, 'reason') ?? '').trim() === '') throw new BankReconError('MATCH_NOTE_REQUIRED')
      return validationErrorResponse(parsed.error)
    }
    return apiSuccess(await moveToSuspense({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
