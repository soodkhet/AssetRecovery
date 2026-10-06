import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { getDeviceCatalogSummary } from '@/lib/device-catalog/queries'

/**
 * `GET /api/settings/device-catalog` (มติ PO U155 → U159 · `13` §6.18) — สรุปหัวหน้า "Model Phone"
 * (จำนวนแบรนด์/รุ่นที่แสดง · ความคืบหน้าการดึงครั้งแรก · งานล่าสุด · ตั้งคีย์แล้วหรือยัง — ไม่ส่งค่าคีย์)
 * สิทธิ์ `manage_device_catalog` ระดับ view
 */
export const GET = withApiPermission(
  'view',
  'manage_device_catalog',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getDeviceCatalogSummary(user.organizationId) })
  },
)
