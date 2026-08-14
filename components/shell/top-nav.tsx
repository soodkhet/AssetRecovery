'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from '@/components/auth/logout-button'
import { cn } from '@/components/ui/cn'
import type { MenuItem } from '@/lib/nav/menu-registry'
import type { ClientSession } from '@/lib/auth/types'

/**
 * Top Nav 7 เมนู — โครง/คลาสตาม mockup `reference/app-shell.html` (`06` §8)
 * รายการเมนูมาจาก `visibleMenus()` ที่ฝั่ง server กรองตาม role มาแล้ว (`06` §7.2)
 * ⚠️ การซ่อนเมนูเป็น UX เท่านั้น — ทุก endpoint ยังตรวจสิทธิ์เองที่ API layer (DEC-002)
 */
export function TopNav({ menus, session }: { menus: readonly MenuItem[]; session: ClientSession }) {
  const pathname = usePathname()

  const tabs = menus.map((menu) => {
    const active = pathname === menu.path || pathname.startsWith(`${menu.path}/`)
    return (
      <Link
        key={menu.id}
        href={menu.path}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'focus-ring rounded-md px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors',
          active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900',
        )}
      >
        {menu.label}
      </Link>
    )
  })

  return (
    <header className="z-30 flex-shrink-0 border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/dashboard" className="focus-ring flex flex-shrink-0 items-center gap-3 rounded">
              <span className="rounded bg-slate-900 p-2 text-white">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2c.42.1.76.47.76.97Z" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              </span>
              <span className="text-lg font-bold tracking-tight text-slate-900">AssetRecovery</span>
            </Link>
            <nav aria-label="เมนูหลัก" className="no-scrollbar hidden overflow-x-auto rounded-lg bg-slate-100 p-1 md:flex">
              {tabs}
            </nav>
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-bold text-slate-900">{session.fullName}</div>
              <div className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                {session.roleName} · {session.roleGroup}
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>

        <nav aria-label="เมนูหลัก (จอเล็ก)" className="no-scrollbar mb-2 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 md:hidden">
          {tabs}
        </nav>
      </div>
    </header>
  )
}
