import type { ReactNode } from 'react'
import { PermissionProvider } from '@/components/auth/permission-provider'
import { SubNav } from '@/components/shell/sub-nav'
import { TopNav } from '@/components/shell/top-nav'
import { ToastProvider } from '@/components/ui/toast'
import type { ClientSession } from '@/lib/auth/types'
import type { MenuItem } from '@/lib/nav/menu-registry'

/**
 * เปลือกนอกของทุกหน้าที่ต้อง login (`06` §8 · mockup `reference/app-shell.html`)
 * โครง: Top Nav (7 เมนูตาม role) → Sub-tab (ถ้าเมนูนั้นมี) → เนื้อหา
 *
 * ⚠️ Field Tracker (ไฟล์ 41) และ Client Portal (ไฟล์ 97) ใช้ shell ของตัวเอง — ไม่ผ่านที่นี่
 * ⚠️ กระดิ่งแจ้งเตือนบน header (`06` §8 · `90` §6.3) จะมาต่อใน Phase 5.1
 */
export function AppShell({
  session,
  menus,
  children,
}: {
  session: ClientSession
  /** เมนูที่กรองตาม role มาแล้วจากฝั่ง server (`visibleMenus()`) — รวมแท็บย่อยของแต่ละเมนู */
  menus: readonly MenuItem[]
  children: ReactNode
}) {
  return (
    <PermissionProvider session={session}>
      <ToastProvider>
        <div className="flex min-h-screen flex-col bg-slate-50">
          <TopNav menus={menus} session={session} />
          <SubNav menus={menus} />
          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </ToastProvider>
    </PermissionProvider>
  )
}
