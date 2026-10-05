import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getDataRetentionPolicy, updateDataRetentionPolicy } from '@/lib/settings/queries/data-retention'
import { dataRetentionUpdateSchema } from '@/lib/settings/schemas'

/**
 * ระยะเก็บเอกสารลูกหนี้ (PDPA — `13` §6.16 · มติ PO 06/10/2569 U97)
 *
 * 1 record ต่อองค์กร ⇒ ไม่มี POST/DELETE · `reason` บังคับ (ตาราง `data_retention_settings` อยู่หมวด
 * `permission` ใน `lib/audit/reason-policy.ts`) · สิทธิ์ `manage_data_retention` (Superadmin/บริหาร)
 *
 * ค่านี้ถูกอ่านโดย job `purge_debtor_documents` (รายวัน) เท่านั้น — ลดจำนวนปีแล้ว job รอบถัดไปลบไฟล์ที่ครบตามค่าใหม่
 */

export const GET = withApiPermission(
  'view',
  'manage_data_retention',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getDataRetentionPolicy(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_data_retention',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = dataRetentionUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getDataRetentionPolicy(user.organizationId)
    const { reason, ...values } = parsed.data
    const policy = await updateDataRetentionPolicy({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: policy })
  },
)
