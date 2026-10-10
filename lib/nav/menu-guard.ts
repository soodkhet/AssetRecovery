import { redirect } from 'next/navigation'
import { DASHBOARD_PATH } from '@/lib/auth/constants'
import { requireInternalSessionPage } from '@/lib/auth/page-guard'
import type { SessionUser } from '@/lib/auth/types'
import { deniedHref } from '@/lib/nav/denied-notice'
import { canViewMenu } from '@/lib/nav/menu-registry'

/**
 * Route guard ของหน้าที่ผูกกับเมนู — ไม่มีสิทธิ์เห็นเมนูนั้น = เด้งกลับแดชบอร์ด `?denied=<เมนู>` พร้อมข้อความ
 * (staging E-072 · แดชบอร์ดทุก role เห็นเสมอ)
 *
 * ⚠️ เป็นชั้น UX เท่านั้นเหมือน `requireSessionPage()` — ข้อมูลจริงของหน้าต้องดึงผ่าน endpoint ที่
 * เรียก `requirePermission()` เองอยู่ดี (DEC-002) · ไม่ตอบ 403 ตรง ๆ เพื่อไม่ leak ว่ามีหน้านี้อยู่
 */
export async function requireMenuPage(menuId: string): Promise<SessionUser> {
  const user = await requireInternalSessionPage()
  if (!canViewMenu(user, menuId)) redirect(deniedHref(DASHBOARD_PATH, menuId))
  return user
}
