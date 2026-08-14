import type { NextRequest } from 'next/server'
import { validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { ASSIGNMENT_READ_CAPABILITIES } from '@/lib/assignments/permissions'
import { listAssignments } from '@/lib/assignments/queries'
import { assignmentListQuerySchema } from '@/lib/assignments/schemas'
import type { AssignmentListResultDto } from '@/lib/assignments/types'

/**
 * `GET /api/assignments` (`40` §17.1 · `45` §6.2) — เคสพร้อมสถานะมอบหมาย
 * อ่านได้ทั้งผู้จัดการ/หัวหน้า (`assign_case`) และผู้บริหาร/การเงิน/บัญชี (`view_master_data`)
 * ขอบเขตแถวคุมด้วย `caseScopeWhere()` — หัวหน้าเห็นทีมเดียว ผู้จัดการเห็นทุกทีมที่ดูแล
 */
export const GET = withEndpoint<unknown, AssignmentListResultDto>({
  endpoint: 'assignment.list',
  action: 'view',
  resource: ASSIGNMENT_READ_CAPABILITIES,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = assignmentListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    )
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await listAssignments(user, parsed.data) }
  },
})
