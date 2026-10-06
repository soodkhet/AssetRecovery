import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listSettingAssumptions } from '@/lib/settings/queries/assumptions'

/**
 * `GET /api/settings/assumptions` (มติ PO 07/10/2569 U140) — ค่าตั้งที่เป็นสมมติฐานรอนักบัญชียืนยัน + สถานะ
 * อ่านด้วย `view_master_data` (ระดับเดียวกับหน้าตั้งค่าที่แสดงป้าย)
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) =>
    Response.json({ data: await listSettingAssumptions(user.organizationId) }),
)
