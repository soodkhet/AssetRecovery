import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { CASE_EDIT_CAPABILITIES } from '@/lib/cases/permissions'
import { MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'
import { getDeviceCatalogSettings } from '@/lib/device-catalog/settings-queries'
import type { DeviceAttributeOptionsDto } from '@/lib/device-catalog/types'

/**
 * `GET /api/device-catalog/attributes` (มติ PO U166) — ตัวเลือกความจุ/สีของฟอร์มรับเคส (ผู้ดูแลแก้ได้ในหน้า Model Phone)
 * สิทธิ์ = ผู้สร้าง/แก้เคส หรือผู้ดูแลแคตตาล็อก · เรียกไม่สำเร็จ ฟอร์มใช้ค่าเริ่มต้นแทน (ไม่บล็อก)
 */
export const GET = withApiPermission(
  'view',
  [...CASE_EDIT_CAPABILITIES, MANAGE_DEVICE_CATALOG_CAPABILITY],
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    const settings = await getDeviceCatalogSettings(user.organizationId)
    const data: DeviceAttributeOptionsDto = {
      capacityOptions: settings.capacityOptions,
      colorOptions: settings.colorOptions,
    }
    return Response.json({ data })
  },
)
