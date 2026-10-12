import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteDraftCase, getCase, updateCase } from '@/lib/cases/queries'
import { CASE_EDIT_CAPABILITIES, CASE_READ_CAPABILITIES, CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { caseDeleteSchema, caseUpdateSchema } from '@/lib/cases/schemas'
import type { CaseDetailDto } from '@/lib/cases/types'

type RouteContext = { params: Promise<{ id: string }> }

/** `GET /api/cases/:id` (`38` §17.1) — นอก scope ตอบ `CASE_NOT_FOUND` เหมือนไม่มีเคสนี้ */
export const GET = withEndpoint<RouteContext, CaseDetailDto>({
  endpoint: 'case.detail',
  action: 'view',
  resource: CASE_READ_CAPABILITIES,
  handler: async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return { data: await getCase(user, id) }
  },
})

/**
 * `PATCH /api/cases/:id` (`38` §8 `edit_case` · `45` §6.1 v1.3) — แก้ได้ทุก field รวม `case_ref`
 * เฉพาะสถานะ draft/pending_review/need_info เท่านั้น (นอกนั้น `CASE_LOCKED_AFTER_APPROVAL`)
 * ทุกครั้งที่สำเร็จเพิ่มแถวใน `case_edit_history` **append-only** (`38` §6.4/§14)
 */
export const PATCH = withEndpoint<RouteContext, CaseDetailDto>({
  endpoint: 'case.update',
  action: 'manage',
  resource: CASE_EDIT_CAPABILITIES,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = caseUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const updated = await updateCase(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data: updated }
  },
})

/**
 * `DELETE /api/cases/:id` (มติผู้ใช้ 12/10/2569 B3-02 · `38` §7.3/§17.1 · `45` §6.1) — ลบเคสร่างที่สร้างผิด/ซ้ำ
 * สิทธิ์เดียวกับการสร้างเคส (ธุรการ/แอดมิน) + scope ระดับแถว · เฉพาะ `draft` · body `{ reason }` บังคับ · soft delete + audit
 */
export const DELETE = withEndpoint<RouteContext, { id: string; caseRef: string; deletedAt: string }>({
  endpoint: 'case.delete',
  action: 'manage',
  resource: CASE_WRITE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = caseDeleteSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const deleted = await deleteDraftCase(user, id, {
      actor: user,
      meta: getRequestMeta(request),
      reason: parsed.data.reason,
    })
    return { data: deleted }
  },
})
