import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createManualDeviceModel, listDeviceModels } from '@/lib/device-catalog/queries'
import { deviceModelCreateSchema, deviceModelListQuerySchema } from '@/lib/device-catalog/schemas'

/**
 * รุ่นใน Model Phone (มติ PO U157/U159)
 * - `GET` ค้นหา (หลายคำ — ชื่อแบรนด์/รุ่น) + แบ่งหน้า · `visibility` · `assetKind` · `brandId`
 * - `POST` เพิ่มรุ่นเองใต้แบรนด์ (ตั้งให้แสดงด้วยมือ) · ชื่อซ้ำในแบรนด์ = `DUPLICATE_DEVICE_CATALOG_ITEM`
 */

export const GET = withApiPermission(
  'view',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceModelListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listDeviceModels(user.organizationId, parsed.data) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceModelCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const { reason, ...values } = parsed.data
    const created = await createManualDeviceModel({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: created }, { status: 201 })
  },
)
