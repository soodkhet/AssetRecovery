import { getRequestMeta } from '@/lib/auth/request-meta'
import { countActiveSuperadmins } from '@/lib/auth/superadmin-queries'
import { assertRoleDeletable, assertRoleRenamable } from '@/lib/roles/guards'
import { readJsonBody, validationErrorResponse, withRolePermission } from '@/lib/roles/http'
import { countRoleUsers, deleteRole, getRole, updateRole } from '@/lib/roles/queries'
import { roleDeleteSchema, roleUpdateSchema } from '@/lib/roles/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/roles/:id` — แก้ชื่อ/สถานะแก้สิทธิ์ได้ของ role
 * seed role เปลี่ยนชื่อไม่ได้ → `SEED_ROLE_RENAME` (`07` §10/§11)
 * สิทธิ์: `manage:manage_roles` = Superadmin เท่านั้น
 */
export const PATCH = withRolePermission<RouteContext>(
  'manage',
  'manage_roles',
  async (request, context, user) => {
    const { id } = await context.params
    const parsed = roleUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const role = await getRole(user.organizationId, id)
    if (parsed.data.name !== undefined) assertRoleRenamable(role, parsed.data.name)

    const updated = await updateRole(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      role,
      { name: parsed.data.name, isEditable: parsed.data.isEditable },
    )

    return Response.json({ data: updated })
  },
)

/**
 * `DELETE /api/roles/:id` — ลบ role (soft delete)
 * seed role ลบไม่ได้ → `SEED_ROLE_DELETE` · ยังมีผู้ใช้ผูกอยู่ → `ROLE_IN_USE` ·
 * บทบาท Superadmin ที่ยังมีคนใช้ → `LAST_SUPERADMIN_REMOVAL` (`07` §10/§11)
 */
export const DELETE = withRolePermission<RouteContext>(
  'manage',
  'manage_roles',
  async (request, context, user) => {
    const { id } = await context.params
    const parsed = roleDeleteSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const role = await getRole(user.organizationId, id)
    const [userCount, activeSuperadminCount] = await Promise.all([
      countRoleUsers(role.id),
      countActiveSuperadmins(user.organizationId),
    ])

    assertRoleDeletable({ role, userCount, activeSuperadminCount })

    await deleteRole({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, role)

    return Response.json({ data: { id: role.id, deleted: true } })
  },
)
