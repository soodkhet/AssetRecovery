import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listEligibleMembers } from '@/lib/teams/queries'

/**
 * `GET /api/teams/eligible-members` — ผู้ใช้ที่ตั้งเป็นผู้จัดการ/หัวหน้าทีมได้ (`09` §7.1)
 * ใช้เติม dropdown ของฟอร์มทีม — คืนเฉพาะ active + role group `inhouse`/`outsource`
 * พร้อมธงว่าเป็นหัวหน้าทีมไหนอยู่แล้ว (FE เตือนล่วงหน้า · API ยังปฏิเสธซ้ำเสมอ)
 *
 * ⚠️ path นี้ต้องไม่ชนกับ `/api/teams/:id` — Next.js เลือก static segment ก่อน dynamic เสมอ
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context, user) => {
    return Response.json({ data: await listEligibleMembers(user.organizationId) })
  },
)
