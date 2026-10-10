import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { MANAGE_PAYOUT_BATCH, previewPayoutBatch } from '@/lib/payout/queries'
import { payoutBatchPreviewQuerySchema } from '@/lib/payout/schemas'

/**
 * `GET /api/payout-batches/preview?side=&cutoffDate=` (staging E-049 · `17` §14 · `27` §6.6) — สรุปจำนวน/ยอดที่วันตัดรอบนี้
 * จะดึงเข้ารอบ ก่อนกดสร้าง · สิทธิ์เดียวกับสร้างรอบ · อ่านอย่างเดียว
 */
export const GET = withApiPermission(
  'manage',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = payoutBatchPreviewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await previewPayoutBatch(user, parsed.data))
  },
)
