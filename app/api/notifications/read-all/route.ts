import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { withAuthErrors } from '@/lib/auth/require-permission'
import { requireSession } from '@/lib/auth/session'
import { markNotificationsRead } from '@/lib/notifications/queries'

/**
 * `PATCH /api/notifications/read-all` (`90` §14 — DEC-006/D3) — มาร์คอ่านทั้งกล่องของผู้เรียกเอง
 *
 * ไม่รับ body (ไม่มีอะไรให้เลือก) · เรียกซ้ำได้ รอบสองคืน `updated: 0` เพราะไม่มีอะไรค้างแล้ว
 * ⚠️ path นี้เป็น segment คงที่ จึงชนะ `[id]` ของ Next.js เสมอ — `read-all` ไม่มีทางถูกอ่านเป็น id
 */
export const PATCH = withAuthErrors(async (_request: NextRequest) => {
  const user = await requireSession()
  return apiSuccess(await markNotificationsRead(user))
})
