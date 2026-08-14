import { redirect } from 'next/navigation'
import { DASHBOARD_PATH } from '@/lib/auth/constants'
import { requireSessionPage } from '@/lib/auth/page-guard'
import type { SessionUser } from '@/lib/auth/types'
import { canViewMenu } from '@/lib/nav/menu-registry'

/**
 * Route guard ของหน้าที่ผูกกับเมนู — ไม่มีสิทธิ์เห็นเมนูนั้น = เด้งกลับแดชบอร์ด (ทุก role เห็นเสมอ)
 *
 * ⚠️ เป็นชั้น UX เท่านั้นเหมือน `requireSessionPage()` — ข้อมูลจริงของหน้าต้องดึงผ่าน endpoint ที่
 * เรียก `requirePermission()` เองอยู่ดี (DEC-002) · ไม่ตอบ 403 ตรง ๆ เพื่อไม่ leak ว่ามีหน้านี้อยู่
 */
export async function requireMenuPage(menuId: string): Promise<SessionUser> {
  const user = await requireSessionPage()
  if (!canViewMenu(user, menuId)) redirect(DASHBOARD_PATH)
  return user
}
