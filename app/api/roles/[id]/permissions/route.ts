import { getRequestMeta } from '@/lib/auth/request-meta'
import { planPermissionChanges } from '@/lib/roles/guards'
import { readJsonBody, validationErrorResponse, withRolePermission } from '@/lib/roles/http'
import { buildRoleMatrix } from '@/lib/roles/matrix'
import {
  applyRolePermissionChanges,
  getRole,
  getRoleAssignments,
  listCapabilities,
} from '@/lib/roles/queries'
import { rolePermissionUpdateSchema } from '@/lib/roles/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/roles/:id/permissions` (`07` §14) — Permission Matrix ของ role นั้น
 * จัดกลุ่มตาม `13` §6.10 (4 กลุ่ม + กลุ่มนอก matrix) พร้อมธง `locked`/`editable` ให้ UI ใช้ disable
 * สิทธิ์: `view:view_master_data` (อ่านอย่างเดียว — `07` §12)
 */
export const GET = withRolePermission<RouteContext>(
  'view',
  'view_master_data',
  async (_request, context, user) => {
    const { id } = await context.params
    const role = await getRole(user.organizationId, id)
    const [capabilities, assignments] = await Promise.all([listCapabilities(), getRoleAssignments(role.id)])

    return Response.json({
      data: { role, sections: buildRoleMatrix(role, capabilities, assignments) },
    })
  },
)

/**
 * `PATCH /api/roles/:id/permissions` (`07` §14) — แก้ Permission Matrix (audit required)
 *
 * กติกาที่บังคับ: role ต้อง `is_editable = true` และไม่ใช่ Superadmin (`ROLE_NOT_EDITABLE`) ·
 * capability ที่ติด "✅ only" แก้ไม่ได้ (`CAPABILITY_LOCKED` — `25` §16.1 · มติ PO 14/08/2569 ล็อก 9 รายการ) ·
 * ทุกครั้งต้องมี `reason` และล้าง session cache เพราะกระทบผู้ใช้ทุกคนในบทบาทนั้น (`90` §13 · `05` §17)
 * สิทธิ์: `manage:manage_roles` = Superadmin เท่านั้น
 */
export const PATCH = withRolePermission<RouteContext>(
  'manage',
  'manage_roles',
  async (request, context, user) => {
    const { id } = await context.params
    const parsed = rolePermissionUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const role = await getRole(user.organizationId, id)
    const [capabilities, assignments] = await Promise.all([listCapabilities(), getRoleAssignments(role.id)])
    const knownCodes = new Set(capabilities.map((capability) => capability.code))

    const plan = planPermissionChanges(role, assignments, parsed.data.entries, knownCodes)

    await applyRolePermissionChanges(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      role,
      plan.changes,
      plan.before,
      plan.after,
    )

    const nextAssignments = await getRoleAssignments(role.id)
    return Response.json({
      data: {
        role,
        changed: plan.changes.length,
        sections: buildRoleMatrix(role, capabilities, nextAssignments),
      },
    })
  },
)
