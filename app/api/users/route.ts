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
 * `team_id`/`company_id` บังคับตาม role group ที่เลือก (`08` §7.1) · อีเมล/เบอร์โทรห้ามซ้ำในองค์กร (§10)
 * ⚠️ ยังไม่ผูก Supabase Auth (`supabase_uid = null`) — ผู้ใช้ที่สร้างใหม่ยัง login ไม่ได้จนกว่า
 * flow เชิญ/ตั้งรหัสผ่านครั้งแรก (open item **D1**) จะถูกเคาะ
 */
export const POST = withApiPermission(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (request: NextRequest, _context, user) => {
    const parsed = userCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const created = await createUser({ actor: user, meta: getRequestMeta(request), reason }, values)

    return Response.json({ data: created }, { status: 201 })
  },
)
