import type { NextRequest } from 'next/server'
import { AuthError, toAuthErrorResponse } from '@/lib/auth/errors'
import { checkPermission } from '@/lib/auth/permission'
import { requireSession } from '@/lib/auth/session'
import type { PermissionAction, ScopeTarget, SessionUser } from '@/lib/auth/types'

/**
 * จุดบังคับสิทธิ์ของทั้งระบบ — **ทุก endpoint ต้องเรียก** (DEC-002 · Rule 03 · `25`)
 * UI hide/disable เป็นแค่ UX ไม่ใช่ security — เรียกตรงที่ API ก็ต้องโดน 403 เหมือนกัน
 *
 * @param action   ระดับที่ขอ: `view` (ดู) / `manage` (แก้ไข/สั่งการ) — DEC-009
 * @param resource capability code (`capabilities.code` — ดู `25` / `prisma/seed.ts`)
 * @param scope    แถวปลายทางที่ต้องตรวจ scope ย่อย (ทีม/บริษัท/ตัวเอง) — ไม่ระบุ = ไม่ตรวจ row-level
 */
export async function requirePermission(
  action: PermissionAction,
  resource: string,
  scope?: ScopeTarget,
): Promise<SessionUser> {
  const user = await requireSession()
  const violation = checkPermission(user, action, resource, scope)
  if (violation !== null) {
    throw new AuthError(violation, `${action}:${resource} user=${user.id}`)
  }
  return user
}

type RouteHandler<Ctx> = (request: NextRequest, context: Ctx, user: SessionUser) => Response | Promise<Response>

/**
 * ห่อ route handler ด้วยการตรวจสิทธิ์ + แปลง `AuthError` เป็น response มาตรฐาน
 * ใช้กับ endpoint ที่ตรวจสิทธิ์ด้วย capability เดียวตรงๆ — เคสที่ scope ขึ้นกับ payload ให้เรียก
 * `requirePermission()` ในตัว handler เองแล้วห่อด้วย `withAuthErrors()`
 */
export function withPermission<Ctx = unknown>(
  action: PermissionAction,
  resource: string,
  handler: RouteHandler<Ctx>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      const user = await requirePermission(action, resource)
      return await handler(request, context, user)
    } catch (error) {
      return toAuthErrorResponse(error)
    }
  }
}

/** ห่อ handler ที่จัดการสิทธิ์เอง — แปลง `AuthError` ที่หลุดออกมาเป็น response มาตรฐาน */
export function withAuthErrors<Ctx = unknown>(
  handler: (request: NextRequest, context: Ctx) => Response | Promise<Response>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context)
    } catch (error) {
      return toAuthErrorResponse(error)
    }
  }
}
