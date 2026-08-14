import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { listFieldCases } from '@/lib/field/queries'
import { fieldCaseListQuerySchema } from '@/lib/field/schemas'
import type { FieldCaseListResultDto } from '@/lib/field/types'

/**
 * `GET /api/field/cases` (`41` §17.1 · `45` §6.3) — งานของพนักงานตาม 4 กลุ่มสถานะ
 *
 * `view=team` = มุมมองทีมของ §7.3 (เห็นรายละเอียดเต็มของเพื่อนร่วมทีม แต่ **read-only** เสมอ —
 * ไม่มี endpoint mutation ไหนรับ assignment ของคนอื่น)
 */
export const GET = withEndpoint<unknown, FieldCaseListResultDto>({
  endpoint: 'field.caseList',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = fieldCaseListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    )
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await listFieldCases(user, parsed.data) }
  },
})
