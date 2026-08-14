import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { assertImportCompany, importCases } from '@/lib/cases/import-queries'
import { CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { caseImportSchema } from '@/lib/cases/schemas'
import type { CaseImportResultDto } from '@/lib/cases/types'

/**
 * `POST /api/cases/import` (`38` §8 `import_cases` · §17.1) — นำเข้าเคสแบบ batch
 * ผลลัพธ์เป็น success/error **ต่อแถว** — แถวผิดไม่ทำให้ทั้งไฟล์ตก (`38` §12)
 */
export const POST = withEndpoint<unknown, CaseImportResultDto>({
  endpoint: 'case.import',
  action: 'manage',
  resource: CASE_WRITE_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = caseImportSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    await assertImportCompany(user.organizationId, parsed.data.financeCompanyId)
    const result = await importCases(parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data: result }
  },
})
