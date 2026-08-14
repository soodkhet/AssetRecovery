import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { reorderFieldSchedules } from '@/lib/field/queries'
import { reorderSchedulesSchema } from '@/lib/field/schemas'
import type { FieldReorderResultDto } from '@/lib/field/types'

/**
 * `PATCH /api/field/cases/reorder` (`41` §8 `reorder_schedule`)
 *
 * ⚠️ โฟลเดอร์ `reorder/` เป็น segment คงที่ที่อยู่ระดับเดียวกับ `[id]/` — Next.js ให้ static ชนะ dynamic
 * (ดูหมายเหตุใน `lib/api/contract.ts`) · การลาก 1 ครั้ง = recompute ลำดับใหม่ทั้งวัน
 */
export const PATCH = withEndpoint<unknown, FieldReorderResultDto>({
  endpoint: 'field.reorderCases',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = reorderSchedulesSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await reorderFieldSchedules(user, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
