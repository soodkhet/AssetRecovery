import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { markExportSent } from '@/lib/exports/queries'
import { exportStatusSchema } from '@/lib/exports/schemas'
import { EXPORT_ACCOUNTING_PACK } from '@/lib/exports/pack'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/accounting/export-history/:id/mark-sent` (`37` §14) — `generated → sent`
 *
 * แยกจากการสร้างไฟล์เพราะ**การส่งจริงเกิดนอกระบบ** (`37` §17) — บันทึกไว้ว่าไฟล์พร้อมกับส่งจริง
 * คนละเวลากันหรือไม่
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  EXPORT_ACCOUNTING_PACK,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = exportStatusSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await markExportSent({ actor: user, meta: getRequestMeta(request) }, id, parsed.data))
  },
)
