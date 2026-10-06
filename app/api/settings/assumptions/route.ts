import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listSettingAssumptionOverview, listSettingAssumptions } from '@/lib/settings/queries/assumptions'

/**
 * `GET /api/settings/assumptions` (มติ PO 07/10/2569 U140) — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน + สถานะ
 * อ่านด้วย `view_master_data` (ระดับเดียวกับหน้าตั้งค่าที่แสดงป้าย)
 * · `?include=current_value` (มติ PO U170 · BUG-180) — เพิ่ม "ค่าที่ใช้อยู่" ของแต่ละรายการ สำหรับหน้ารวมในเมนูบัญชี
 *   (ป้ายบนหน้าตั้งค่าไม่ส่ง ⇒ ไม่ต้อง query ค่าตั้งทุกตัว)
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const withValues = request.nextUrl.searchParams.get('include') === 'current_value'
    return Response.json({
      data: withValues
        ? await listSettingAssumptionOverview(user.organizationId)
        : await listSettingAssumptions(user.organizationId),
    })
  },
)
