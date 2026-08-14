import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  applyFunctionalMatrixChanges,
  getFunctionalMatrix,
} from '@/lib/settings/queries/functional-permissions'
import { functionalPermissionUpdateSchema } from '@/lib/settings/schemas'

/**
 * Functional Permission Matrix (`13` §6.10 · §13) — grid 37 รายการ × ทุก role
 *
 * สิทธิ์: แก้ = `manage:manage_roles` = **Superadmin เท่านั้น** (`13` §11 · 1 ใน 9 รายการที่ล็อก)
 * · กติกาที่บังคับซ้ำจากไฟล์ 07: role ที่ `is_editable = false` และ capability ที่ติด "✅ only"
 *   แก้ไม่ได้ → `ROLE_NOT_EDITABLE` / `CAPABILITY_LOCKED` (UI disable เป็นแค่ UX)
 * · เปลี่ยนสิทธิ์ = critical action ⇒ `reason` บังคับ + ล้าง session cache (`13` §6.10 · `90` §13)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getFunctionalMatrix(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_roles',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = functionalPermissionUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { changed } = await applyFunctionalMatrixChanges(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      parsed.data,
    )
    return Response.json({ data: { changed, matrix: await getFunctionalMatrix(user.organizationId) } })
  },
)
