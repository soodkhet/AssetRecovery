import { getRequestMeta } from '@/lib/auth/request-meta'
import { readJsonBody, validationErrorResponse, withRolePermission } from '@/lib/roles/http'
import { createRole, listRoles } from '@/lib/roles/queries'
import { roleCreateSchema } from '@/lib/roles/schemas'

/**
 * `GET /api/roles` (`07` §14) — รายชื่อ role ทั้ง 15 ตัว + role ที่สร้างเพิ่มเอง
 *
 * สิทธิ์: `view:view_master_data` — บริหาร/การเงิน/บัญชี/ธุรการ ดูได้อย่างเดียวตาม `07` §12 + `25` §7.1
 * (capability `manage_roles` ถูกล็อกไว้กับ Superadmin ตาม `25` §16.1 จึงใช้เป็นสิทธิ์ "ดู" ไม่ได้)
 */
export const GET = withRolePermission('view', 'view_master_data', async (_request, _context, user) => {
  return Response.json({ data: await listRoles(user.organizationId) })
})

/**
 * `POST /api/roles` — สร้าง role เพิ่มเอง (`07` §9 lifecycle) · seed role 15 ตัวมีอยู่แล้วห้ามสร้างซ้ำ
 * สิทธิ์: `manage:manage_roles` = Superadmin เท่านั้น (`25` §16.1 "✅ only")
 */
export const POST = withRolePermission('manage', 'manage_roles', async (request, _context, user) => {
  const parsed = roleCreateSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const role = await createRole(
    { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
    { name: parsed.data.name, roleGroup: parsed.data.roleGroup },
  )

  return Response.json({ data: role }, { status: 201 })
})
