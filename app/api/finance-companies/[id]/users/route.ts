import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listCompanyUsers } from '@/lib/finance-companies/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/finance-companies/:id/users` (`10` §14) — บัญชีผู้ใช้ฝั่งบริษัท
 *
 * **read-only ในเฟสนี้**: `POST /:id/users` (สร้าง company user) ต้อง provision Supabase Auth
 * ซึ่งขึ้นกับ flow invite/first-login ที่ยังเป็น open item D1 — จึงเป็นงานของ Users module (1.9)
 *
 * scope: company user เห็นได้เฉพาะบริษัทตัวเอง — ตรวจใน `getFinanceCompany()` (403 ถ้าข้ามบริษัท)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await listCompanyUsers(user, id) })
  },
)
