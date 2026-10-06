import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { CASE_EDIT_CAPABILITIES } from '@/lib/cases/permissions'
import { searchDeviceModelOptions } from '@/lib/device-catalog/queries'
import { deviceModelSearchQuerySchema } from '@/lib/device-catalog/schemas'

/**
 * `GET /api/device-catalog/options?assetKind=&q=&limit=` (มติ PO U155/U157/U159) — ค้นหารุ่นให้ combobox ในฟอร์มรับเคส
 * เฉพาะรายการที่แสดงขององค์กร (แบรนด์แสดง + รุ่นแสดง) · สิทธิ์ = ผู้สร้าง/แก้เคส (`CASE_EDIT_CAPABILITIES`)
 * หรือผู้ดูแลแคตตาล็อก · ไม่มีผล/เรียกไม่สำเร็จ ฟอร์มยังให้ "ระบุเอง" ได้เสมอ (ห้ามบล็อกการรับเคส)
 */
export const GET = withApiPermission(
  'view',
  [...CASE_EDIT_CAPABILITIES, 'manage_device_catalog'],
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceModelSearchQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await searchDeviceModelOptions(user.organizationId, parsed.data) })
  },
)
