import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { requireSessionPage } from '@/lib/auth/page-guard'
import { toClientSession } from '@/lib/auth/types'
import { visibleMenus } from '@/lib/nav/menu-registry'

/**
 * Layout ของทุกหน้าหลัง login ที่ใช้ App Shell (Top Nav 7 เมนู — `06` §8)
 * route group `(app)` ไม่ปรากฏใน URL: `app/(app)/dashboard/page.tsx` → `/dashboard`
 *
 * หน้าที่ **ไม่** อยู่ใน group นี้: `/login` (ไม่มี shell) · `/field` (ไฟล์ 41 mobile-first shell ของตัวเอง)
 * · `/portal` (ไฟล์ 97 portal shell ของตัวเอง)
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireSessionPage()

  return (
    <AppShell session={toClientSession(user)} menus={visibleMenus(user)}>
      {children}
    </AppShell>
  )
}
