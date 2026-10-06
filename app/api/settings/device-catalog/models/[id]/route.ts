import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { updateDeviceModel } from '@/lib/device-catalog/queries'
import { catalogIdSchema, deviceModelUpdateSchema } from '@/lib/device-catalog/schemas'
import { SettingsError } from '@/lib/settings/errors'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/settings/device-catalog/models/:id` (มติ PO U157/U159) — แก้ชื่อ/ประเภท/ปีที่ออก/การแสดงด้วยมือ
 * แก้ชื่อแล้ว job ไม่ทับชื่อนั้นอีก · `manualStatus: null` = กลับไปตามตัวกรอง
 * เคสเดิมเก็บข้อความ snapshot ไว้แล้ว ไม่เปลี่ยนตาม
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    if (!catalogIdSchema.safeParse(id).success) throw new SettingsError('DEVICE_CATALOG_ITEM_NOT_FOUND', { detail: `id=${id}` })
    const parsed = deviceModelUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const updated = await updateDeviceModel({ actor: user, meta: getRequestMeta(request), reason }, id, values)
    return Response.json({ data: updated })
  },
)
