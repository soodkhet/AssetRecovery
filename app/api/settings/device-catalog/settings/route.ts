import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { deviceCatalogSettingsSchema } from '@/lib/device-catalog/schemas'
import { getDeviceCatalogSettings, updateDeviceCatalogSettings } from '@/lib/device-catalog/settings-queries'

/**
 * ตัวกรองการแสดงของ Model Phone (มติ PO U159 · `13` §6.18) — รายชื่อแบรนด์ + แสดงรุ่นภายใน N ปีล่าสุด
 * 1 record ต่อองค์กร (GET ไม่เขียน DB) · บันทึกแล้วมีผลทันที (คำนวณตอนอ่าน) โดยไม่แตะค่าที่ตั้งด้วยมือ
 */

export const GET = withApiPermission(
  'view',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getDeviceCatalogSettings(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceCatalogSettingsSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const current = await getDeviceCatalogSettings(user.organizationId)
    const saved = await updateDeviceCatalogSettings({ actor: user, meta: getRequestMeta(request), reason }, current, values)
    return Response.json({ data: saved })
  },
)
