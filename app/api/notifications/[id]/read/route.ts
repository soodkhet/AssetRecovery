import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { validationErrorResponse } from '@/lib/api/http'
import { withAuthErrors } from '@/lib/auth/require-permission'
import { requireSession } from '@/lib/auth/session'
import { markNotificationsRead } from '@/lib/notifications/queries'

const paramsSchema = z.object({ id: z.uuid() })

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `PATCH /api/notifications/:id/read` (`90` §14) — มาร์คอ่านทีละรายการ
 *
 * สิทธิ์เหมือน `GET /api/notifications` (ของตัวเองเท่านั้น — ดูเหตุผลที่ไฟล์นั้น)
 * id ของคนอื่น/ไม่มีจริง ⇒ `updated: 0` **ไม่ใช่ 404** เพื่อไม่บอกใบ้ว่ามีแถวนั้นอยู่จริงไหม
 * และทำให้กดซ้ำ/ยิงซ้ำได้โดยผลลัพธ์ไม่เปลี่ยน (idempotent)
 */
export const PATCH = withAuthErrors(async (_request: NextRequest, context: RouteContext) => {
  const user = await requireSession()

  const parsed = paramsSchema.safeParse(await context.params)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  return apiSuccess(await markNotificationsRead(user, [parsed.data.id]))
})
