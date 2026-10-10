import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { reasonSchema } from '@/lib/api/validation'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_CREDIT_NOTE } from '@/lib/credit-notes/permissions'
import { waiveAwaitingCreditNote } from '@/lib/credit-notes/queries'

type RouteContext = { params: Promise<{ adjustmentId: string }> }

const waiveSchema = z.object({ reason: reasonSchema })

/**
 * `POST /api/accounting/credit-notes/awaiting/:adjustmentId/waive` (staging E-016 · `31` §14 · `27` §6.10)
 * ปิดป้าย "รอใบลดหนี้" ของบิลที่ชำระครบแล้วเป็น "จัดการนอกระบบ" — สิทธิ์เดียวกับบันทึกใบลดหนี้ · เหตุผลบังคับ
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  MANAGE_CREDIT_NOTE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { adjustmentId } = await context.params
    const parsed = waiveSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(
      await waiveAwaitingCreditNote({ actor: user, meta: getRequestMeta(request) }, adjustmentId, parsed.data),
    )
  },
)
