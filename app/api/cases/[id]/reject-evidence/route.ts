import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { FIELD_REJECT_EVIDENCE_CAPABILITY } from '@/lib/field/permissions'
import { rejectFieldEvidence } from '@/lib/field/queries'
import { rejectEvidenceSchema } from '@/lib/field/schemas'
import type { FieldActionResultDto } from '@/lib/field/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/cases/:id/reject-evidence` (`41` §8 `reject_evidence` · §10.1)
 *
 * ⚠️ **เจ้าหน้าที่อนุมัติเคส (system role) เท่านั้น** — capability `reject_evidence` ซึ่ง `25` §7
 * ให้เฉพาะ role นั้น · ผู้จัดการ/หัวหน้าทีมติดตามทรัพย์ของไฟล์ 40 ใช้ปุ่มนี้ไม่ได้แม้ชื่อจะคล้ายกัน
 * ⚠️ ห้ามสลับกับ `reject_expense` (คนละสาย คนละผลลัพธ์ — `41` §10.1)
 */
export const POST = withEndpoint<RouteContext, FieldActionResultDto>({
  endpoint: 'case.rejectEvidence',
  action: 'manage',
  resource: FIELD_REJECT_EVIDENCE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = rejectEvidenceSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await rejectFieldEvidence(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data }
  },
})
