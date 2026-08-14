import type { NextRequest } from 'next/server'
import type { z } from 'zod'
import { authErrorMessage } from '@/lib/auth/errors'
import { requirePermission } from '@/lib/auth/require-permission'
import type { PermissionAction, SessionUser } from '@/lib/auth/types'
import { toRoleErrorResponse } from '@/lib/roles/errors'
import { toFieldErrors } from '@/lib/roles/schemas'

/**
 * ตัวห่อ route handler ของโมดูล Roles & Permissions
 * ตรวจสิทธิ์ที่ API layer เสมอ (DEC-002) แล้วแปลง `RoleError`/`AuthError` เป็น response มาตรฐาน
 * error ชนิดอื่นถูกโยนต่อให้กลายเป็น 500 จริง (ห้ามกลืนเป็น 400/403 ปลอม)
 *
 * TODO(Phase 2.1): ย้ายไปใช้ response envelope กลางของไฟล์ `45` เมื่อ API Contract Infra พร้อม
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
  return async (request, context) => {
    try {
      const user = await requirePermission(action, resource)
      return await handler(request, context, user)
    } catch (error) {
      return toRoleErrorResponse(error)
    }
  }
}

/** 400 + field errors ตาม `24` §6.1 `REQUIRED_MISSING` (FE ใช้ `fields` แสดง inline error) */
export function validationErrorResponse(error: z.ZodError): Response {
  return Response.json(
    {
      error: {
        code: 'REQUIRED_MISSING',
        ...authErrorMessage('REQUIRED_MISSING'),
        fields: toFieldErrors(error),
      },
    },
    { status: 400 },
  )
}

/** อ่าน JSON body — body ที่ไม่ใช่ JSON ต้องได้ 400 ไม่ใช่ 500 */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
