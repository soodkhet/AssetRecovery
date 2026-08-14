import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getFinanceCompany, setFinanceCompanyStatus } from '@/lib/finance-companies/queries'
import { financeCompanyStatusSchema } from '@/lib/finance-companies/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/finance-companies/:id/status` (`10` §9.3) — ระงับ / เปิดใช้งานบริษัท
 *
 * transition endpoint แยกจาก PATCH ตาม Rule 04 (`POST /:id/action-name`) เพราะมีกติกาของตัวเอง:
 * ระงับต้องมีเหตุผลเสมอ (`SUSPEND_REASON_REQUIRED`) และเหตุผลถูกเก็บทั้งใน `suspended_reason`
 * (แสดงบนการ์ด) และ audit log · เปิดใช้งานกลับล้างเหตุผลเดิมทิ้ง ไม่มีเงื่อนไขพิเศษ
 *
 * บริษัทที่ `suspended` ห้ามรับเคสใหม่ — ตัวบล็อกอยู่ที่ไฟล์ 38 (`SUSPENDED_COMPANY_NEW_CASE`)
 * ซึ่งอ่านสถานะจากตารางนี้ตรง ๆ · event `finance-company.suspended` รอ event bus ของ Phase 2.1
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  'manage_companies',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = financeCompanyStatusSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getFinanceCompany(user, id)
    const company = await setFinanceCompanyStatus(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
      parsed.data.status,
    )

    return Response.json({ data: company })
  },
)
