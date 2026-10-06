import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { bulkSetDeviceModelManualStatus } from '@/lib/device-catalog/queries'
import { deviceModelBulkStatusSchema } from '@/lib/device-catalog/schemas'

/**
 * `POST /api/settings/device-catalog/models/status` (มติ PO U157/U159) — ตั้งการแสดงด้วยมือหลายรุ่นในครั้งเดียว
 * (`active`/`hidden`/`null` = กลับไปตามตัวกรอง) · ทั้งชุดอยู่ใน transaction เดียว
 * id ที่ไม่ใช่ขององค์กร = `DEVICE_CATALOG_ITEM_NOT_FOUND` (ไม่แตะอะไรเลย)
 */
export const POST = withApiPermission(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceModelBulkStatusSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ids, manualStatus } = parsed.data
    const result = await bulkSetDeviceModelManualStatus({ actor: user, meta: getRequestMeta(request), reason }, ids, manualStatus)
    return Response.json({ data: result })
  },
)
