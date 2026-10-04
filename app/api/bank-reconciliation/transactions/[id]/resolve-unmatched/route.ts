import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import {
  bodyStringField,
  readJsonBody,
  toModuleErrorResponse,
  validationErrorResponse,
  withApiPermission,
} from '@/lib/api/http'
import { BankReconError } from '@/lib/bank-recon/errors'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { resolveUnmatchedTransaction, MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/queries'
import { resolveUnmatchedSchema } from '@/lib/bank-recon/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/bank-reconciliation/transactions/:id/resolve-unmatched` (`35` §14 · `27` §6.14 v3)
 *
 * ปิดรายการที่ไม่มีทางจับคู่ได้จริง (ค่าธรรมเนียมธนาคาร/ดอกเบี้ยรับ) — **เหตุผลบังคับเสมอ**
 * (`35` §10) และห้ามผูก FK ใด ๆ (`35` §6.4 · CHECK `bank_tx_status_fk_shape`)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    const parsed = resolveUnmatchedSchema.safeParse(body)
    if (!parsed.success) {
      // ไม่มีเหตุผล ⇒ `MATCH_NOTE_REQUIRED` (`24` §6.3) ไม่ใช่ `REQUIRED_MISSING` (UAT R7cv3-B03)
      if ((bodyStringField(body, 'matchNote') ?? '').trim() === '') throw new BankReconError('MATCH_NOTE_REQUIRED')
      return validationErrorResponse(parsed.error)
    }

    return apiSuccess(
      await resolveUnmatchedTransaction({ actor: user, meta: getRequestMeta(request) }, id, parsed.data),
    )
  },
)
