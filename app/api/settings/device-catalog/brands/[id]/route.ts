import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { updateDeviceBrand } from '@/lib/device-catalog/queries'
import { catalogIdSchema, deviceBrandUpdateSchema } from '@/lib/device-catalog/schemas'
import { SettingsError } from '@/lib/settings/errors'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/settings/device-catalog/brands/:id` (มติ PO U157/U159) — แก้ชื่อ / ตั้งการแสดงด้วยมือ
 * `manualStatus`: `active` แสดง · `hidden` ไม่แสดง (ทุกรุ่นของแบรนด์ไม่แสดง) · `null` กลับไปตามตัวกรอง
 * การตั้งด้วยมือชนะตัวกรองเสมอ และ job/การเปลี่ยนตัวกรองไม่เขียนทับ
 */
export const PATCH = withApiPermission<RouteContext>(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    if (!catalogIdSchema.safeParse(id).success) throw new SettingsError('DEVICE_CATALOG_ITEM_NOT_FOUND', { detail: `id=${id}` })
    const parsed = deviceBrandUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const brand = await updateDeviceBrand({ actor: user, meta: getRequestMeta(request), reason }, id, values)
    return Response.json({ data: brand })
  },
)
