import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createManualDeviceBrand, listDeviceBrands } from '@/lib/device-catalog/queries'
import { deviceBrandCreateSchema, deviceBrandListQuerySchema } from '@/lib/device-catalog/schemas'

/**
 * แบรนด์ใน Model Phone (มติ PO U157/U159)
 * - `GET` ค้นหา + แบ่งหน้า · `visibility` = all/visible/hidden/manual
 * - `POST` เพิ่มแบรนด์เอง (ตั้งให้แสดงด้วยมือ) · ชื่อซ้ำ (ไม่สนตัวพิมพ์/ช่องว่าง) = `DUPLICATE_DEVICE_CATALOG_ITEM`
 */

export const GET = withApiPermission(
  'view',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceBrandListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listDeviceBrands(user.organizationId, parsed.data) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceBrandCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const { reason, ...values } = parsed.data
    const created = await createManualDeviceBrand({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: created }, { status: 201 })
  },
)
