import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { FieldShell } from '@/components/field/field-shell'
import { DASHBOARD_PATH, FIELD_TRACKER_PATH } from '@/lib/auth/constants'
import { requireSessionPage } from '@/lib/auth/page-guard'
import { resolveLandingPath } from '@/lib/auth/landing'
import { hasCapability } from '@/lib/auth/permission'
import { toClientSession } from '@/lib/auth/types'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'

/**
 * Layout ของ Field Tracker (ไฟล์ 41) — **ไม่อยู่ใน route group `(app)`**
 * เพราะใช้ shell ของตัวเอง (mobile bottom nav / desktop sidebar 260px fixed — `41` §5)
 *
 * ⚠️ guard นี้เป็นชั้น UX เท่านั้น (ไม่ให้คนที่ไม่ได้ทำงานภาคสนามหลงเข้ามาเจอหน้าจอเปล่า) —
 * ข้อมูลจริงยังผ่าน `requirePermission('view'|'manage', 'perform_field_work')` ที่ API ทุก endpoint (DEC-002)
 */
export default async function FieldLayout({ children }: { children: ReactNode }) {
  const user = await requireSessionPage()

  if (!hasCapability(user, 'view', FIELD_CAPABILITY)) {
    // กันวนซ้ำ: พนักงานภาคสนามที่ถูกถอดสิทธิ์จะได้ปลายทางเป็น `/field` เอง — ส่งไปแดชบอร์ดแทน
    const landing = resolveLandingPath(user.roleGroup, user.roleName)
    redirect(landing === FIELD_TRACKER_PATH ? DASHBOARD_PATH : landing)
  }

  return <FieldShell session={toClientSession(user)}>{children}</FieldShell>
}
