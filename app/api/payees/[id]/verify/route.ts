import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_PAYEE_PROFILE, verifyPayee } from '@/lib/payees/queries'
import { payeeVerifySchema } from '@/lib/payees/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/payees/:id/verify` (`18` §9/§14 · `23` §6.2 `unverified → verified`)
 *
 * เกตก่อนยืนยัน: ข้อมูลภาษี/ธนาคารครบ (`REQUIRED_MISSING`) + เอกสารยืนยันตัวตนเมื่อองค์กรตั้ง
 * `require_payee_id_document = true` (`13` §6.2.1 → `PAYEE_ID_DOCUMENT_REQUIRED`)
 * · ชื่อบัญชีไม่ตรงชื่อผู้รับเงินคืนเป็น **warning** `BANK_ACCOUNT_NAME_MISMATCH` ไม่บล็อก (`18` §11)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = payeeVerifySchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await verifyPayee(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      id,
    )
    return apiSuccess(result.payee, { warning: result.warning })
  },
)
