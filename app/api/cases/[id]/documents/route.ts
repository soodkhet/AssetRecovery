import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { addCaseDocument } from '@/lib/cases/queries'
import { CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { caseDocumentUploadSchema } from '@/lib/cases/schemas'
import type { CaseDetailDto } from '@/lib/cases/types'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/cases/:id/documents` (`38` §17.1 · §6.3) — แนบไฟล์เข้า slot
 *
 * ไฟล์จริงขึ้น Supabase Storage ก่อน แล้วส่ง metadata (`fileUrl` + `fileHash` SHA-256) มาผูกกับเคส
 * 1 slot มีหลายไฟล์ได้ · `product_photo` จำกัด 8 รูปต่อเคส (`38` §6.3.1)
 */
export const POST = withEndpoint<RouteContext, CaseDetailDto>({
  endpoint: 'case.uploadDocument',
  action: 'manage',
  resource: CASE_WRITE_CAPABILITY,
  handler: async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = caseDocumentUploadSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const updated = await addCaseDocument(user, id, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data: updated, status: 201 }
  },
})
