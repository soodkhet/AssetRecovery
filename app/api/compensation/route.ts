import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { listCompensationApprovals } from '@/lib/compensation/approval-queries'
import { compensationListQuerySchema } from '@/lib/compensation/approval-types'

/**
 * `GET /api/compensation` (`16` §14 · `27` §6.5) — รายการค่าตอบแทนพร้อมขั้นอนุมัติปัจจุบัน
 *
 * รับได้ทั้ง 3 capability ของสายอนุมัติ (`25` §7.2) — ผู้จัดการเห็นเฉพาะทีมที่ตนดูแล
 * (scope ระดับแถวบังคับในชั้นข้อมูล `16` §10) · ยอด WHT/Net เป็นตัวเลข**แสดงผล** ที่คิดจาก
 * `calculateWhtForPayee()` (Payee ชนะ Plan — `18` §6.3) ยอดผูกพันจริง snapshot ที่ Phase 3.4
 */
export const GET = withApiPermission(
  'view',
  APPROVAL_STEP_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = compensationListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listCompensationApprovals(user, parsed.data))
  },
)
