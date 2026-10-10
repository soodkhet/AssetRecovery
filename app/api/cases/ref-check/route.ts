import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import { checkCaseRef } from '@/lib/cases/queries'
import { caseRefCheckQuerySchema } from '@/lib/cases/schemas'

/**
 * `GET /api/cases/ref-check?companyId=&caseRef=&excludeCaseId=` (staging E-027 · `38` §11) — ตรวจเลขที่สัญญาซ้ำ
 * ระหว่างกรอก · สิทธิ์เดียวกับรับเคส · อ่านอย่างเดียว (การกันซ้ำจริงยังอยู่ตอนบันทึก 2 ชั้นเหมือนเดิม)
 */
export const GET = withEndpoint<unknown, { duplicate: { id: string; caseRef: string; status: string; trackingRound: number } | null }>({
  endpoint: 'case.refCheck',
  action: 'manage',
  resource: CASE_WRITE_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = caseRefCheckQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await checkCaseRef(user, parsed.data) }
  },
})
