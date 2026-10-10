import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVE_ADVANCE, reviewAdvanceClear } from '@/lib/advances/queries'
import { advanceClearReviewSchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/advances/:id/clear-review` (staging E-012 · `15` §9.1 · `27` §6.4) — การเงินตรวจการเคลียร์ยอดแล้ว
 * ไม่เปลี่ยนสถานะ (ยัง `cleared`) · ประทับผู้ตรวจ/เวลา + audit · ตรวจแล้วตีกลับไม่ได้อีก
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  APPROVE_ADVANCE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = advanceClearReviewSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await reviewAdvanceClear({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
