import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'
import { getDeviceTacHistory } from '@/lib/device-catalog/tac-queries'

/**
 * `GET /api/settings/device-catalog/tac-history` (มติ PO U167) — ประวัติการอัปเดตฐาน TAC 50 รอบล่าสุด
 * (ผล/ผู้สั่ง/จำนวนที่เพิ่ม/รายชื่อรุ่นที่เพิ่ม/วันที่ไฟล์บน GitHub ถูกแก้) + TAC ที่ระบบจำจากงานจริงล่าสุด
 */
export const GET = withApiPermission(
  'view',
  MANAGE_DEVICE_CATALOG_CAPABILITY,
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getDeviceTacHistory(user.organizationId) })
  },
)
