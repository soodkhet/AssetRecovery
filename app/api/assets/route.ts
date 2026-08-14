import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { WAREHOUSE_READ_CAPABILITIES } from '@/lib/warehouse/permissions'
import { listAssets } from '@/lib/warehouse/queries'
import { assetListQuerySchema } from '@/lib/warehouse/schemas'
import type { AssetListDto } from '@/lib/warehouse/types'

/**
 * `GET /api/assets` (`44` §15 · `45` §6.4) — รายการเครื่องพร้อม filter 8 ตัวของ §8.2
 *
 * scope ระดับแถวอยู่ที่ `assetScopeWhere()` — Company User เห็นเฉพาะบริษัทตัวเอง (§13 · T15)
 * `status` ส่งได้หลายค่าคั่นด้วย `,` (แท็บ "รับเข้าคลัง" = `pending_intake,intake_rejected`)
 */
export const GET = withEndpoint<unknown, AssetListDto>({
  endpoint: 'asset.list',
  action: 'view',
  resource: WAREHOUSE_READ_CAPABILITIES,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = assetListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await listAssets(user, parsed.data) }
  },
})
