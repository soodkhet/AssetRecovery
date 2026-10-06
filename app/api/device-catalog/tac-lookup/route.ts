import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { CASE_EDIT_CAPABILITIES } from '@/lib/cases/permissions'
import { MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'
import { deviceTacLookupQuerySchema } from '@/lib/device-catalog/schemas'
import { lookupDeviceTac } from '@/lib/device-catalog/tac-queries'

/**
 * `GET /api/device-catalog/tac-lookup?imei=` (มติ PO U166) — ฟอร์มรับเคสกรอก IMEI แล้วเติมยี่ห้อ/รุ่นจากฐาน TAC
 * IMEI ตรวจด้วย `parseImei()` จุดเดียว (ผิดรูป = 400) · ไม่พบ = `found: false` (ฟอร์มให้เลือก/พิมพ์เอง — ไม่บล็อก)
 * สิทธิ์เดียวกับตัวเลือกรุ่น = ผู้สร้าง/แก้เคส หรือผู้ดูแลแคตตาล็อก
 */
export const GET = withApiPermission(
  'view',
  [...CASE_EDIT_CAPABILITIES, MANAGE_DEVICE_CATALOG_CAPABILITY],
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceTacLookupQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await lookupDeviceTac(user.organizationId, parsed.data.imei) })
  },
)
