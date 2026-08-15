import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { answerAccountantQuestion } from '@/lib/accounting/question-queries'
import { MANAGE_ACCOUNTANT_QUESTIONS } from '@/lib/accounting/question'
import { questionAnswerSchema } from '@/lib/accounting/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/questions/:id/answer` (`36` §13) — `open → answered`
 * ตอบได้ครั้งเดียว (`ACCOUNTANT_QUESTION_ALREADY_ANSWERED`) เพื่อคงหลักฐานการสื่อสาร (`36` §8)
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  MANAGE_ACCOUNTANT_QUESTIONS,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = questionAnswerSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(
      await answerAccountantQuestion({ actor: user, meta: getRequestMeta(request) }, id, parsed.data),
    )
  },
)
