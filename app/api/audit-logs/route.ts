import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listAuditLogs } from '@/lib/audit/log-queries'
import { auditLogListQuerySchema } from '@/lib/audit/log-schemas'
import { VIEW_AUDIT_LOG } from '@/lib/audit/log-access'

/**
 * `GET /api/audit-logs` (`90` §14) — บันทึกการใช้งานพร้อมตัวกรอง (target_type / actor / ช่วงวันที่)
 *
 * สิทธิ์: `view_audit_log` ระดับ `view` (`90` §12 — Superadmin/บริหาร/บัญชี/การเงิน)
 * **อ่านอย่างเดียวทั้ง endpoint** — audit ห้ามแก้/ลบทุกกรณี (`02` §13) จึงไม่มี POST/PATCH/DELETE ที่นี่
 * scope: กรอง `organization_id` ของผู้เรียกเสมอ + Company User โดน 403 ที่ชั้นข้อมูล (ดู `log-queries.ts`)
 */
export const GET = withApiPermission(
  'view',
  VIEW_AUDIT_LOG,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = auditLogListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listAuditLogs(user, parsed.data))
  },
)
