import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createCase, listCases } from '@/lib/cases/queries'
import { caseCreateSchema, caseListQuerySchema } from '@/lib/cases/schemas'
import { CASE_READ_CAPABILITIES, CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import type { CaseDetailDto, CaseListResultDto } from '@/lib/cases/types'

/**
 * `GET /api/cases` (`38` §17.1 · `45` §6.1) — List พร้อม filter
 * scope ระดับแถวอยู่ที่ `caseScopeWhere()` (ผู้จัดการเห็นทีมตัวเอง · company user เห็นบริษัทตัวเอง)
 */
export const GET = withEndpoint<unknown, CaseListResultDto>({
  endpoint: 'case.list',
  action: 'view',
  resource: CASE_READ_CAPABILITIES,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = caseListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await listCases(user, parsed.data) }
  },
})

/**
 * `POST /api/cases` — รับเคสทุกช่องทาง (manual form + API ingestion แยกด้วย `sourceChannel`)
 *
 * `38` §11: สร้าง `draft` ได้เสมอแม้ข้อมูล/เอกสารยังไม่ครบ — **ยกเว้น `case_ref` ซ้ำ** ที่ต้อง reject
 * ทุกช่องทางเหมือนกัน (กันซ้ำ 2 ชั้น: pre-check + unique index)
 */
export const POST = withEndpoint<unknown, CaseDetailDto>({
  endpoint: 'case.create',
  action: 'manage',
  resource: CASE_WRITE_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = caseCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createCase(parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data: created, status: 201 }
  },
})
