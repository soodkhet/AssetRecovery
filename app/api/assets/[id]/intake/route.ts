import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { WAREHOUSE_INTAKE_CAPABILITY } from '@/lib/warehouse/permissions'
import { intakeAsset } from '@/lib/warehouse/queries'
import { assetIntakeSchema } from '@/lib/warehouse/schemas'
import type { AssetDetailDto } from '@/lib/warehouse/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/assets/:id/intake` (`44` §8.2 · §9.1) — ยืนยันรับเครื่องเข้าคลัง
 *
 * **IMEI ไม่ตรง = เตือน ไม่ block** (`44` §12 `IMEI_MISMATCH`) — ตอบ 200 พร้อม `warning` ใน envelope
 * ธุรการยืนยันทับคำเตือนได้ (force proceed) แต่ค่าที่ตรวจจริงถูกบันทึกไว้เสมอ
 * เครื่องที่เคยตีกลับกดรับใหม่ได้จาก endpoint เดิม — ระบบลง event `asset.intake_retry` เพิ่มให้เอง
 */
export const POST = withEndpoint<RouteContext, AssetDetailDto>({
  endpoint: 'asset.intake',
  action: 'manage',
  resource: WAREHOUSE_INTAKE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = assetIntakeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await intakeAsset(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return result.warning === undefined ? { data: result.asset } : { data: result.asset, warning: result.warning }
  },
})
