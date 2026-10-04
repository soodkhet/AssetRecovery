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
import { cancelWhtCertificate } from '@/lib/wht/queries'
import { whtCancelSchema } from '@/lib/wht/schemas'
import { MANAGE_WHT, requireWhtCancelReason } from '@/lib/wht/wht'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/wht-certificates/:id/cancel` (`33` §14 — DEC-006/D4) — `active → cancelled`
 *
 * เหตุผลบังคับเสมอ (`WHT_CANCEL_REQUIRES_REASON`) · ยกเลิกแล้ว**ห้ามลบ ห้าม reverse** (`02` §13)
 * และยอดของใบนี้หายจาก ภ.ง.ด.3/53 ของรอบทันที (`33` §16)
 * · สิทธิ์ = `manage_wht` ของบัญชีเท่านั้น — การเงินที่ดูได้ยกเลิกเอกสารทางภาษีไม่ได้ (`25` §7.5)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_WHT,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const body = await readJsonBody(request)
    const parsed = whtCancelSchema.safeParse(body)
    if (!parsed.success) {
      // ไม่มีเหตุผล ⇒ `WHT_CANCEL_REQUIRES_REASON` (`24` §6.8) ไม่ใช่ `REQUIRED_MISSING` (UAT R7cv3-B03)
      requireWhtCancelReason(bodyStringField(body, 'reason'))
      return validationErrorResponse(parsed.error)
    }

    return apiSuccess(await cancelWhtCertificate({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
