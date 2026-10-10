'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useState, type ReactNode } from 'react'
import { SessionExpiredDialog } from '@/components/auth/session-expired-dialog'
import { LogoutButton } from '@/components/auth/logout-button'
import { PortalIcon, PortalLogo } from '@/components/portal/portal-icons'
import { PortalScopeProvider } from '@/components/portal/portal-scope'
import { LINK_PENDING_CORNER_CLASS, LinkPending } from '@/components/shell/link-pending'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'
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
import { portalPageHref, stripPortalViewAsPrefix } from '@/lib/portal/view-as'
import { useOverlayDismiss } from '@/components/ui/use-overlay-dismiss'

export interface PortalShellProps {
  companyName: string
  userName: string
  roleName: string
  /** หมวดที่ผู้ใช้เห็น (`visiblePortalSections()` ฝั่ง server) */
  sections: readonly PortalSection[]
  children: ReactNode
  /** โหมดดูในฐานะลูกค้าของผู้ใช้ภายใน (มติ U59) — ไม่ส่ง = ผู้ใช้บริษัทดู portal ของตัวเอง */
  viewAs?: PortalShellViewAs
}

export interface PortalShellViewAs {
  companyId: string
  /** บริษัทถูกระงับ — ยังเปิดดูได้แต่ป้ายบนสุดบอกสถานะ */
  suspended: boolean
  /** ลิงก์กลับระบบภายใน (หน้าบริษัทไฟแนนซ์) */
  backHref: string
}

/**
 * เปลือกพอร์ทัลบริษัทไฟแนนซ์ (`97` §5/§7 · mockup `97-client-portal-mockup.html` `layout()` +
 * `97-client-portal-mobile-mockup.html` `renderHeader()`/`renderHamburger()`/`renderBottomNav()`)
 *
 * - Desktop (md+): Top Bar 64px sticky + แถบแท็บ underline (`border-b-2`) ใต้ header
 * - Mobile: header 56px (ชื่อหน้า + ชื่อบริษัท + ปุ่มเมนู) · เมนูเลื่อนจากขวา · bottom nav 4 ปุ่มหลัก
 * - แท็บของหมวดที่ไม่มีสิทธิ์ถูก **ซ่อน** · ไม่มีกระดิ่งแจ้งเตือน (`97` §7)
 * - บรรทัด "โหมดดูอย่างเดียว" ท้ายเนื้อหาทุกหน้า (`97` §5)
 * - โหมดดูในฐานะลูกค้า (มติ U59): ป้ายบนสุดทุกหน้า + ลิงก์ทุกตัวชี้ `/portal/view-as/<id>/...` + API ได้ `?as=<id>`
 */
export function PortalShell({ companyName, userName, roleName, sections, children, viewAs }: PortalShellProps) {
  const pathname = usePathname()
  const viewAsCompanyId = viewAs?.companyId ?? null
  const activeKey = activePortalNavKey(stripPortalViewAsPrefix(pathname))
  const navItems = portalNavItems(sections).map((item) => ({ ...item, href: portalPageHref(item.href, viewAsCompanyId) }))
  const activeItem = navItems.find((item) => item.key === activeKey)

  return (
    <PortalScopeProvider viewAsCompanyId={viewAsCompanyId}>
      <div className="flex min-h-screen flex-col bg-slate-50">
        {viewAs !== undefined && <PortalViewAsBanner companyName={companyName} viewAs={viewAs} />}
        <PortalTopBar
          companyName={companyName}
          userName={userName}
          roleName={roleName}
          homeHref={portalPageHref(PORTAL_HOME_PATH, viewAsCompanyId)}
        />
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

        <PortalBottomNav sections={sections} activeKey={activeKey} viewAsCompanyId={viewAsCompanyId} />
        {/* session หมดระหว่างใช้งาน ⇒ พาไปเข้าสู่ระบบ (preship R8-009) — Suspense: ใช้ useSearchParams */}
        <Suspense fallback={null}>
          <SessionExpiredDialog />
        </Suspense>
      </div>
    </PortalScopeProvider>
  )
}

/** ป้ายบนสุดของโหมดดูในฐานะลูกค้า (มติ U59) — ผู้ใช้ภายในต้องรู้ตัวตลอดว่ากำลังดูข้อมูลของบริษัทไหน */
export function PortalViewAsBanner({ companyName, viewAs }: { companyName: string; viewAs: PortalShellViewAs }) {
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6 lg:px-8">
        <span className="font-bold">กำลังดูในฐานะ {companyName} (ดูอย่างเดียว)</span>
        {viewAs.suspended && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
            บริษัทนี้ถูกระงับการใช้งาน — ผู้ใช้ของบริษัทเข้าพอร์ทัลไม่ได้
          </span>
        )}
        <span className="text-amber-700">ทุกการเปิดดูและดาวน์โหลดถูกบันทึกในชื่อของท่าน</span>
        <Link href={viewAs.backHref} className="focus-ring ml-auto rounded font-semibold underline underline-offset-2">
          กลับระบบภายใน
        </Link>
      </div>
    </div>
  )
}

export function PortalTopBar({
  companyName,
  userName,
  roleName,
  homeHref = PORTAL_HOME_PATH,
}: {
  companyName: string
  userName: string
  roleName: string
  homeHref?: string
}) {
  return (
    <header className="sticky top-0 z-30 hidden border-b border-slate-200 bg-white md:block">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href={homeHref} className="focus-ring flex min-w-0 items-center gap-3 rounded pointer-coarse:min-h-11">
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
    // 768px: gap-6 ทำให้แท็บสุดท้ายล้นถูกตัดใต้ scrollbar ที่ซ่อน ⇒ ช่องห่างแคบลงต่ำกว่า lg + wrap กันล้น (preship R4-020)
    <nav
      aria-label="เมนูพอร์ทัล"
      className="mb-6 hidden flex-wrap gap-x-4 border-b border-slate-200 md:flex lg:gap-x-6"
    >
      {items.map((item) => {
        const active = item.key === activeKey
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // `relative` ให้ spinner ระหว่างเปลี่ยนหน้าลอยมุม ไม่ดันความกว้าง (preship R2-024/R2-034)
              'focus-ring-inset relative flex items-center gap-2 border-b-2 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors pointer-coarse:min-h-11',
              active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            <PortalIcon name={item.key} />
            {item.label}
            <LinkPending className={LINK_PENDING_CORNER_CLASS} />
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
            className="focus-ring inline-flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 -mr-2 shrink-0 rounded-lg p-2 text-slate-700 active:bg-slate-100"
          >
            <PortalIcon name="menu" className="h-6 w-6" />
          </button>
        </div>
      </header>

      {open && (
        <PortalMenuDrawer
          companyName={companyName}
          userName={userName}
          roleName={roleName}
          navItems={navItems}
          activeKey={activeKey}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** staging E-075 — เมนูพอร์ทัลบนจอเล็ก: Esc / Back ปิด · ล็อกการเลื่อน · โฟกัสเข้าแผง (แบบเดียวกับเมนู Field Tracker) */
function PortalMenuDrawer({
  companyName,
  userName,
  roleName,
  navItems,
  activeKey,
  onClose,
}: {
  companyName: string
  userName: string
  roleName: string
  navItems: readonly PortalNavItem[]
  activeKey: PortalNavKey | null
  onClose: () => void
}) {
  const { panelRef, navigateFromMenu } = useOverlayDismiss(onClose)
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/50 md:hidden" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="เมนูพอร์ทัล"
        tabIndex={-1}
        className="focus:outline-none absolute top-0 right-0 bottom-0 flex w-72 flex-col bg-white shadow-xl"
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
            onClick={onClose}
            aria-label="ปิดเมนู"
            className={cn('focus-ring inline-flex items-center justify-center rounded p-1.5 text-slate-400', TOUCH_TARGET_CLASS)}
          >
            <PortalIcon name="close" className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="เมนูพอร์ทัล (จอเล็ก)" className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={(event) => navigateFromMenu(event, item.href)}
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
  )
}

export function PortalBottomNav({
  sections,
  activeKey,
  viewAsCompanyId = null,
}: {
  sections: readonly PortalSection[]
  activeKey: PortalNavKey | null
  viewAsCompanyId?: string | null
}) {
  const items = portalBottomNavItems(sections).map((item) => ({ ...item, href: portalPageHref(item.href, viewAsCompanyId) }))
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
