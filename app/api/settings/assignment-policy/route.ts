import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  getAssignmentPolicySettings,
  updateAssignmentPolicySettings,
} from '@/lib/settings/queries/assignment-policy'
import { assignmentPolicyUpdateSchema } from '@/lib/settings/schemas'

/**
 * นโยบายการมอบหมายงาน (`40` §6.4/§11/§13 — UAT BUG-002 · มติ PO 03/10/2569)
 *
 * 1 record ต่อองค์กร ⇒ ไม่มี POST/DELETE · แก้ได้เฉพาะผู้ถือ `manage_settings` (seed ไม่มอบให้ role ใด
 * ⇒ Superadmin เท่านั้นตาม `40` §13) · `reason` บังคับเพราะกระทบสิทธิ์ของหัวหน้าทีม (`90` §13)
 *
 * ค่าใหม่มีผลกับคำขอมอบหมาย/เปลี่ยนผู้รับผิดชอบ**ใหม่**เท่านั้น — คำขอที่ค้างอยู่ snapshot `expires_at` แล้ว
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getAssignmentPolicySettings(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = assignmentPolicyUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const policy = await updateAssignmentPolicySettings({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: policy })
  },
)
