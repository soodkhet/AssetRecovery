import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
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
    const parsed = resolveUnmatchedSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(
      await resolveUnmatchedTransaction({ actor: user, meta: getRequestMeta(request) }, id, parsed.data),
    )
  },
)
