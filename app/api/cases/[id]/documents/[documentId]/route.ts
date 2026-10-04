import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deleteCaseDocument } from '@/lib/cases/queries'
import { CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { caseDocumentDeleteSchema } from '@/lib/cases/schemas'
import type { CaseDetailDto } from '@/lib/cases/types'

type RouteContext = { params: Promise<{ id: string; documentId: string }> }

/**
 * `DELETE /api/cases/:id/documents/:documentId` (`38` §17.1 · `45` §6.1 — มติ PO 04/10/2569 v3.4)
 *
 * ลบเอกสารที่แนบผิด **ก่อนส่งตรวจ** (ร่าง/ขอข้อมูลเพิ่ม) — soft-delete + audit · ไม่ลบไฟล์ใน Storage
 * สิทธิ์ + scope เดียวกับการแนบเอกสาร (`case.uploadDocument`) · body `{ reason? }` ไม่บังคับ
 */
export const DELETE = withEndpoint<RouteContext, CaseDetailDto>({
  endpoint: 'case.deleteDocument',
  action: 'manage',
  resource: CASE_WRITE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id, documentId } = await context.params
    const parsed = caseDocumentDeleteSchema.safeParse((await readJsonBody(request)) ?? {})
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const updated = await deleteCaseDocument(user, id, documentId, {
      actor: user,
      meta: getRequestMeta(request),
      reason: parsed.data.reason ?? undefined,
    })
    return { data: updated }
  },
})
