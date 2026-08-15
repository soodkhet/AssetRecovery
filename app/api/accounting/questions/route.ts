import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { createAccountantQuestion, listAccountantQuestions } from '@/lib/accounting/question-queries'
import { MANAGE_ACCOUNTANT_QUESTIONS, QUESTION_READ_CAPABILITIES } from '@/lib/accounting/question'
import { questionCreateSchema, questionListQuerySchema } from '@/lib/accounting/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

/**
 * `GET|POST /api/accounting/questions` (`36` §13) — แท็บ "ข้อซักถาม"
 * บันทึก/ตอบ = บัญชี · การเงินอ่านอย่างเดียว (`36` §11)
 */
export const GET = withApiPermission(
  'view',
  QUESTION_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = questionListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listAccountantQuestions(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_ACCOUNTANT_QUESTIONS,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = questionCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createAccountantQuestion({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(created, { status: 201 })
  },
)
