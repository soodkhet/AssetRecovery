'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { LogoutButton } from '@/components/auth/logout-button'
import { PortalIcon, PortalLogo } from '@/components/portal/portal-icons'
import { cn } from '@/components/ui/cn'
import type { PortalSection } from '@/lib/portal/access'
import {
  PORTAL_HOME_PATH,
  activePortalNavKey,
  portalBottomNavItems,
  portalNavItems,
  type PortalNavItem,
  type PortalNavKey,
} from '@/lib/portal/nav'

export interface PortalShellProps {
  companyName: string
  userName: string
  roleName: string
  /** หมวดที่ผู้ใช้เห็น (`visiblePortalSections()` ฝั่ง server) */
  sections: readonly PortalSection[]
  children: ReactNode
}

/**
 * เปลือกพอร์ทัลบริษัทไฟแนนซ์ (`97` §5/§7 · mockup `97-client-portal-mockup.html` `layout()` +
 * `97-client-portal-mobile-mockup.html` `renderHeader()`/`renderHamburger()`/`renderBottomNav()`)
 *
 * - Desktop (md+): Top Bar 64px sticky + แถบแท็บ underline (`border-b-2`) ใต้ header
 * - Mobile: header 56px (ชื่อหน้า + ชื่อบริษัท + ปุ่มเมนู) · เมนูเลื่อนจากขวา · bottom nav 4 ปุ่มหลัก
 * - แท็บของหมวดที่ไม่มีสิทธิ์ถูก **ซ่อน** · ไม่มีกระดิ่งแจ้งเตือน (`97` §7)
 * - บรรทัด "โหมดดูอย่างเดียว" ท้ายเนื้อหาทุกหน้า (`97` §5)
 */
export function PortalShell({ companyName, userName, roleName, sections, children }: PortalShellProps) {
  const pathname = usePathname()
  const activeKey = activePortalNavKey(pathname)
  const navItems = portalNavItems(sections)
  const activeItem = navItems.find((item) => item.key === activeKey)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PortalTopBar companyName={companyName} userName={userName} roleName={roleName} />
      <PortalMobileHeader
        title={activeItem?.label ?? 'AssetRecovery'}
        companyName={companyName}
        userName={userName}
        roleName={roleName}
        navItems={navItems}
        activeKey={activeKey}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-28 sm:px-6 md:py-8 lg:px-8">
        <PortalTabs items={navItems} activeKey={activeKey} />
        <div>{children}</div>
        <PortalReadOnlyNote companyName={companyName} />
      </main>

      <PortalBottomNav sections={sections} activeKey={activeKey} />
    </div>
  )
}

export function PortalTopBar({ companyName, userName, roleName }: { companyName: string; userName: string; roleName: string }) {
  return (
    <header className="sticky top-0 z-30 hidden border-b border-slate-200 bg-white md:block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href={PORTAL_HOME_PATH} className="focus-ring flex min-w-0 items-center gap-3 rounded">
            <PortalLogo />
            <span className="min-w-0">
              <span className="text-lg font-bold tracking-tight text-slate-900">AssetRecovery</span>
              <span className="mt-0.5 block truncate text-[10px] leading-none font-semibold text-slate-500">
                พอร์ทัลบริษัทไฟแนนซ์ · {companyName}
              </span>
            </span>
          </Link>
          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-bold text-slate-900">{userName}</div>
              <div className="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{roleName}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  )
}

export function PortalTabs({ items, activeKey }: { items: readonly PortalNavItem[]; activeKey: PortalNavKey | null }) {
  return (
    <nav aria-label="เมนูพอร์ทัล" className="no-scrollbar mb-6 hidden gap-6 overflow-x-auto border-b border-slate-200 md:flex">
      {items.map((item) => {
        const active = item.key === activeKey
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'focus-ring-inset flex items-center gap-2 border-b-2 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            <PortalIcon name={item.key} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function PortalMobileHeader({
  title,
  companyName,
  userName,
  roleName,
  navItems,
  activeKey,
}: {
  title: string
  companyName: string
  userName: string
  roleName: string
  navItems: readonly PortalNavItem[]
  activeKey: PortalNavKey | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-extrabold text-slate-900">{title}</div>
            <div className="truncate text-[13px] text-slate-400">{companyName}</div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="เปิดเมนู"
            aria-expanded={open}
            className="focus-ring -mr-2 shrink-0 rounded-lg p-2 text-slate-700 active:bg-slate-100"
          >
            <PortalIcon name="menu" className="h-6 w-6" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 md:hidden" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="เมนูพอร์ทัล"
            className="absolute top-0 right-0 bottom-0 flex w-72 flex-col bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-800">{userName}</div>
                <div className="truncate text-[13px] text-slate-400">
                  {roleName} · {companyName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิดเมนู"
                className="focus-ring rounded p-1.5 text-slate-400"
              >
                <PortalIcon name="close" className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="เมนูพอร์ทัล (จอเล็ก)" className="flex-1 overflow-y-auto py-2">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={item.key === activeKey ? 'page' : undefined}
                  className={cn(
                    'focus-ring-inset flex w-full items-center gap-3 px-4 py-3 text-sm font-medium active:bg-slate-50',
                    item.key === activeKey ? 'bg-slate-50 text-slate-900' : 'text-slate-600',
                  )}
                >
                  <PortalIcon name={item.key} className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="border-t border-slate-100 p-3">
              <div className="flex justify-center">
                <LogoutButton />
              </div>
              <div className="mt-3 text-center text-[13px] text-slate-400">โหมดดูอย่างเดียว (Read-only)</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function PortalBottomNav({ sections, activeKey }: { sections: readonly PortalSection[]; activeKey: PortalNavKey | null }) {
  const items = portalBottomNavItems(sections)
  return (
    <nav
      aria-label="เมนูหลัก (จอเล็ก)"
      className="fixed right-0 bottom-0 left-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] md:hidden"
    >
      <div className="mx-auto grid max-w-[480px]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = activeKey !== null && item.matches.includes(activeKey)
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring-inset flex flex-col items-center justify-center gap-1 py-2.5',
                active ? 'text-slate-900' : 'text-slate-400',
              )}
            >
              <PortalIcon name={item.key} className="h-5 w-5" />
              <span className="text-[13px] leading-none font-bold">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function PortalReadOnlyNote({ companyName }: { companyName: string }) {
  return (
    <div className="mt-8 text-[11px] text-slate-400">
      แสดงเฉพาะข้อมูลของ {companyName} · โหมดดูอย่างเดียว (Read-only)
    </div>
  )
}
