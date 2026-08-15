import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createPayoutBatch, listPayoutBatches, MANAGE_PAYOUT_BATCH } from '@/lib/payout/queries'
import { payoutBatchCreateSchema, payoutBatchListQuerySchema } from '@/lib/payout/schemas'

/**
 * รอบจ่ายเงิน (`17` §14 · `27` §6.6) — `GET`/`POST /api/payout-batches`
 *
 * อ่าน = `view:manage_payout_batch` (บัญชี/ผู้บริหารดูได้ read-only — `17` §12)
 * สร้าง = `manage:manage_payout_batch` (การเงินเท่านั้น) — ระบบดึงรายการที่อนุมัติแล้วมารวมให้เอง
 * แล้วเปลี่ยน `draft → checking` ทันที (`17` §9 — ไม่มีปุ่มให้ผู้ใช้กด)
 */

export const GET = withApiPermission(
  'view',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = payoutBatchListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listPayoutBatches(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = payoutBatchCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    // `WHT_RATE_FALLBACK_TO_PLAN` = เตือนไม่บล็อก ⇒ รอบถูกสร้างจริงแล้ว แต่ต้องบอกว่าใครใช้อัตราสำรอง
    const { batch, warning } = await createPayoutBatch({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(batch, { status: 201, ...(warning === undefined ? {} : { warning }) })
  },
)
