import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getSlaPolicy, updateSlaPolicy } from '@/lib/settings/queries/sla-policy'
import { slaPolicyUpdateSchema } from '@/lib/settings/schemas'

/**
 * เกณฑ์ SLA ของงานติดตาม (`13` §6.14 — มติ PO 15/08/2569 · D18)
 *
 * 1 record ต่อองค์กร ⇒ ไม่มี POST/DELETE · `reason` บังคับ (ตารางนี้อยู่หมวด `permission`
 * ใน `lib/audit/reason-policy.ts` ⇒ ทุก mutation ต้องมีเหตุผล)
 *
 * ค่านี้ถูกอ่านโดย **รายงาน O2/O4 เท่านั้น** (`96` §6-O2/O4) — ไม่มี flow ใดถูกบล็อกด้วยค่านี้
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getSlaPolicy(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = slaPolicyUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getSlaPolicy(user.organizationId)
    const { reason, ...values } = parsed.data
    const policy = await updateSlaPolicy({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: policy })
  },
)
