import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { WAREHOUSE_REJECT_INTAKE_CAPABILITY } from '@/lib/warehouse/permissions'
import { rejectAssetIntake } from '@/lib/warehouse/queries'
import { assetRejectIntakeSchema } from '@/lib/warehouse/schemas'
import type { AssetDetailDto } from '@/lib/warehouse/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/assets/:id/reject-intake` (`44` §8.2) — ตีกลับเครื่องที่รับเข้าไม่ได้
 *
 * `rejectReason` บังคับเสมอ (`44` §10) — ช่องว่างถูกปฏิเสธด้วย `REJECT_MISSING_REASON`
 * (ไม่ใช่ `REQUIRED_MISSING`) และเหตุผลเดียวกันถูกบันทึกลง audit ในทรานแซกชันเดียวกัน
 */
export const POST = withEndpoint<RouteContext, AssetDetailDto>({
  endpoint: 'asset.rejectIntake',
  action: 'manage',
  resource: WAREHOUSE_REJECT_INTAKE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = assetRejectIntakeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await rejectAssetIntake(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
