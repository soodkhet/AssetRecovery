import type { NextRequest } from 'next/server'
import { withApiPermission } from '@/lib/api/http'
import type { PermissionAction } from '@/lib/auth/types'
import type { SessionUser } from '@/lib/auth/types'
import { toRoleErrorResponse } from '@/lib/roles/errors'

/**
 * ตัวห่อ route handler ของโมดูล Roles & Permissions — ตัวจริงอยู่ที่ `lib/api/http.ts` (Phase 1.7)
 * เหลือไว้ที่นี่เพื่อผูก `toRoleErrorResponse()` ให้อัตโนมัติ
 */
type RoleRouteHandler<Ctx> = (
  request: NextRequest,
  context: Ctx,
  user: SessionUser,
) => Response | Promise<Response>

export function withRolePermission<Ctx = unknown>(
  action: PermissionAction,
  resource: string,
  handler: RoleRouteHandler<Ctx>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return withApiPermission(action, resource, toRoleErrorResponse, handler)
}

export { readJsonBody, validationErrorResponse } from '@/lib/api/http'
