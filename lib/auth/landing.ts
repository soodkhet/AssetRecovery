import type { RoleGroup } from '@/lib/generated/prisma/enums'
import {
  CLIENT_PORTAL_PATH,
  DASHBOARD_PATH,
  FIELD_AGENT_ROLE_NAME,
  FIELD_TRACKER_PATH,
} from '@/lib/auth/constants'

/**
 * ปลายทางหลัง login สำเร็จ (`05` §6.1 "Redirect → หน้า Dashboard ตาม role")
 * - บริษัทไฟแนนซ์ → Client Portal (ไฟล์ 97)
 * - พนักงานติดตามทรัพย์ → Field Tracker (ไฟล์ 41 — mobile-first)
 * - role อื่น → แดชบอร์ดหลัก (`06` §7.2 — ทุก role เห็นเมนูแดชบอร์ด)
 *
 * หมายเหตุ: เป็นเส้นทาง UI ล้วน อ้างจาก mockup `login.html` + `06` §7.2 — หน้าจริงเกิดใน Phase 1.5 เป็นต้นไป
 */
export function resolveLandingPath(roleGroup: RoleGroup, roleName: string): string {
  if (roleGroup === 'finance_company') return CLIENT_PORTAL_PATH
  if ((roleGroup === 'inhouse' || roleGroup === 'outsource') && roleName === FIELD_AGENT_ROLE_NAME) {
    return FIELD_TRACKER_PATH
  }
  return DASHBOARD_PATH
}
