import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { MANAGE_BILLING, previewBillingBatch } from '@/lib/revenue/queries'
import { billingBatchPreviewQuerySchema } from '@/lib/revenue/schemas'

/**
 * `GET /api/billing-batches/preview?companyId=&cutoffDate=` (staging E-049 · mytester G-05 · `19` §14 · `27` §6.7)
 * — สรุปจำนวน/ยอดรายได้ที่วันตัดรอบนี้จะดึงเข้ารอบวางบิล + ยอดที่อยู่หลังวันตัดรอบ ก่อนกดสร้าง
 * · สิทธิ์เดียวกับสร้างรอบ (การเงิน) · อ่านอย่างเดียว
 */
export const GET = withApiPermission(
  'manage',
  MANAGE_BILLING,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = billingBatchPreviewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await previewBillingBatch(user, parsed.data))
  },
)
