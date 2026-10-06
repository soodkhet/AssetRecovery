import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createUser, listUsers } from '@/lib/users/queries'
import { userCreateSchema, userListQuerySchema } from '@/lib/users/schemas'

/**
 * `GET /api/users` (`08` §14) — รายการผู้ใช้ + filter `roleGroup`/`roleId`/`teamId`/`companyId`/`status`/`search`
 *
 * สิทธิ์: `view:manage_users` (`08` §12 — ผู้จัดการทีมดูได้ตาม scope ทีมตัวเอง, Superadmin ดูทั้งหมด)
 * scope ระดับแถวบังคับที่ `lib/users/queries.ts` (`userScopeFilter`) ไม่ใช่ที่นี่
 */
export const GET = withApiPermission(
  'view',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, _context, user) => {
    const url = new URL(request.url)
    const parsed = userListQuerySchema.safeParse({
      roleGroup: url.searchParams.get('roleGroup') ?? undefined,
      roleId: url.searchParams.get('roleId') ?? undefined,
      teamId: url.searchParams.get('teamId') ?? undefined,
      companyId: url.searchParams.get('companyId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
    })
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return Response.json({ data: await listUsers(user, parsed.data) })
  },
)

/**
 * `POST /api/users` (`08` §14) — สร้างบัญชีผู้ใช้ใหม่
 *
 * `team_id`/`company_id` บังคับตาม role group ที่เลือก (`08` §7.1) · username/อีเมล/เบอร์โทรห้ามซ้ำในองค์กร (§10)
 * มติ PO 03/10/2569: ผู้ดูแลตั้งรหัสผ่านเริ่มต้นให้ในฟอร์มเลย (ไม่ส่งอีเมลเชิญ) → ผู้ใช้ login ได้ทันที
 * และถูกบังคับเปลี่ยนรหัสเองตอน login ครั้งแรก · บัญชี Supabase Auth สร้างไม่สำเร็จ = 502 ไม่สร้างผู้ใช้
 */
export const POST = withApiPermission(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, _context, user) => {
    const parsed = userCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { password, confirmPassword: _confirm, payment, ...values } = parsed.data
    // มติ PO U131 — ส่วน "ข้อมูลรับเงิน" (ไม่บังคับ) สร้าง Payee ใน transaction เดียวกัน · ต้องถือ manage:manage_payee_profile
    const result = await createUser(
      { actor: user, meta: getRequestMeta(request), reason: null },
      values,
      password,
      payment,
    )

    return Response.json(
      result.warning === null ? { data: result.user } : { data: result.user, warning: result.warning },
      { status: 201 },
    )
  },
)
