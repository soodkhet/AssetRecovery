import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { loadUserPendingWork } from '@/lib/users/pending-work-queries'
import { getUser } from '@/lib/users/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/users/:id/pending-work` — งานค้างของผู้ใช้ (อ่านอย่างเดียว)
 * · งานภาคสนามที่ยังไม่จบ + ใบเบิกไม่ผูกงานที่ยังอยู่ในสายอนุมัติ ⇒ กันการย้ายทีม/กลุ่ม (มติ D7-03 · mytester7 S7-AG7-01/03)
 * · คิวรออนุมัติที่ผู้ใช้เป็นผู้ลงมือ + เป็นผู้อนุมัติคนเดียวไหม ⇒ เตือนก่อนระงับ (S7-AG7-04)
 *
 * สิทธิ์เท่ากับการแก้/ระงับผู้ใช้ (`manage_users` ระดับ manage) — ยาม scope แถวผ่าน `getUser()` (404 ไม่ leak)
 */
export const GET = withApiPermission<RouteContext>(
  'manage',
  'manage_users',
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    const target = await getUser(user, id)
    return Response.json({ data: await loadUserPendingWork(user, target.id) })
  },
)
