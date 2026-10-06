import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { bulkSetDeviceCatalogVisibility } from '@/lib/device-catalog/queries'
import { deviceCatalogBulkVisibilitySchema } from '@/lib/device-catalog/schemas'

/**
 * `POST /api/settings/device-catalog/bulk-visibility` (มติ PO U162) — "เลือกทั้งหมด / ไม่เลือกทั้งหมด"
 *
 * ตั้งการแสดงด้วยมือ (`active`/`hidden`) ให้**ทุกแบรนด์หรือทุกรุ่นที่ตรงตัวกรอง/คำค้นที่ส่งมา** (เงื่อนไขชุดเดียวกับ
 * `GET .../brands` / `GET .../models` — ทั้งชุด ไม่ใช่แค่หน้าที่เห็น) · ทั้งชุดใน transaction เดียว ·
 * เหตุผลบังคับ · audit 1 แถวต่อการกด (สรุปจำนวน + เงื่อนไข) · ค่าที่ตั้งเป็นการตั้งด้วยมือ ⇒ job ดึงข้อมูลไม่เขียนทับ
 */
export const POST = withApiPermission(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceCatalogBulkVisibilitySchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await bulkSetDeviceCatalogVisibility(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      parsed.data,
    )
    return Response.json({ data: result })
  },
)
