import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { previewCompensationBulkApproval } from '@/lib/compensation/approval-queries'
import { compensationBulkPreviewQuerySchema } from '@/lib/compensation/approval-types'

/**
 * `GET /api/compensation/bulk-preview?ids=a,b,c` (`27` §6.5 · mytester2 F2-01) — ยอดสรุปของหน้าต่าง "อนุมัติที่เลือก (N)"
 *
 * capability/scope เดียวกับ `GET /api/compensation` (ผู้จัดการเห็นเฉพาะทีมที่ดูแล · ขั้นที่ถึงตน) · อ่านอย่างเดียว
 * · ยอด WHT คิดแบบรอบจ่ายถัดไปด้วย pure module เดียวกับคิว (`approvalWhtSelectionTotals()`) — เป็นประมาณการ
 */
export const GET = withApiPermission(
  'view',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = compensationBulkPreviewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await previewCompensationBulkApproval(user, parsed.data))
  },
)
