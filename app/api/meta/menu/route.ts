import { withAuthErrors } from '@/lib/auth/require-permission'
import { requireSession } from '@/lib/auth/session'
import { resolveMenuAudience, visibleMenus } from '@/lib/nav/menu-registry'

/**
 * `GET /api/meta/menu` (`06` §14) — เมนูที่ผู้ใช้ **คนที่เรียกเอง** มองเห็น ใช้ render top nav/sub-tab
 *
 * สิทธิ์: ต้อง login + บัญชี active + session ไม่หมดอายุ (`requireSession()` บังคับครบทั้งสามข้อ)
 * ไม่ผูกกับ capability code ใด เพราะ `06` §7.2 กำหนดการมองเห็นเมนูเป็นราย role และ endpoint นี้
 * คืนข้อมูลของผู้เรียกเองเท่านั้น (ไม่มีข้อมูลผู้อื่น/ข้อมูลธุรกิจ) — เหมือน `GET /api/auth/session`
 * ⚠️ ตัวเมนูไม่ใช่ security boundary: endpoint ของแต่ละโมดูลยังต้องเรียก `requirePermission()` เองเสมอ
 */
export const GET = withAuthErrors(async () => {
  const user = await requireSession()

  return Response.json({
    data: {
      audience: resolveMenuAudience(user),
      menus: visibleMenus(user),
    },
  })
})
