import type { NextRequest } from 'next/server'
import { apiFailure, apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { auditErrorMessage, auditErrorStatus } from '@/lib/audit/errors'
import { VIEW_AUDIT_LOG } from '@/lib/audit/log-access'
import { getAuditLog } from '@/lib/audit/log-queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/audit-logs/:id` (`90` §14) — before/after JSON เต็มของรายการเดียว
 *
 * id ที่ไม่มีจริง กับ id ขององค์กรอื่น ตอบ `AUDIT_LOG_NOT_FOUND` เหมือนกันเสมอ (ไม่ leak ว่ามีอยู่)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  VIEW_AUDIT_LOG,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    const row = await getAuditLog(user, id)
    if (row === null) {
      return apiFailure(
        { code: 'AUDIT_LOG_NOT_FOUND', ...auditErrorMessage('AUDIT_LOG_NOT_FOUND') },
        auditErrorStatus('AUDIT_LOG_NOT_FOUND'),
      )
    }
    return apiSuccess(row)
  },
)
