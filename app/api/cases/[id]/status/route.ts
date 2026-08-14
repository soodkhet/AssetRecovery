import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { CASE_EDIT_CAPABILITIES } from '@/lib/cases/permissions'
import { caseStatusChangeSchema } from '@/lib/cases/schemas'
import { changeCaseStatus, type CaseStatusChangeResult } from '@/lib/cases/status-queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/cases/:id/status` (`38` §8/§10/§17.1 · `45` §6.1)
 *
 * capability ที่ตัวห่อตรวจเป็น **ขั้นต่ำ** (ใครที่แตะ workflow เคสได้บ้าง) — ตัวจริงต่อ action
 * อยู่ที่ `assertActionAllowed()` ในชั้น service ตาม `38` §13
 * (`accept`/`reject`/`request_more_info` + recycle ทั้ง 3 = เจ้าหน้าที่อนุมัติเคสเท่านั้น)
 */
export const PATCH = withEndpoint<RouteContext, CaseStatusChangeResult>({
  endpoint: 'case.changeStatus',
  action: 'manage',
  resource: CASE_EDIT_CAPABILITIES,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = caseStatusChangeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await changeCaseStatus(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data: result }
  },
})
