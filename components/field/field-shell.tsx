'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { PermissionProvider } from '@/components/auth/permission-provider'
import { FieldCasesProvider, useFieldCases } from '@/components/field/field-cases-provider'
import {
  IconCalendar,
  IconChart,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconCompass,
  IconHome,
  IconInbox,
  IconLogout,
  IconMenu,
  IconTruck,
  IconUser,
  IconWallet,
} from '@/components/field/field-icons'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { FieldPwaProvider } from '@/components/field/pwa-provider'
import { FieldReassignmentProvider } from '@/components/field/reassignment-provider'
import { ToastProvider } from '@/components/ui'
import { LOGIN_PATH } from '@/lib/auth/constants'
import type { ClientSession } from '@/lib/auth/types'
import {
  activeFieldNavId,
  fieldBadgeCount,
  fieldBottomNavItems,
  fieldNavSections,
  type FieldBadgeCounts,
  type FieldNavId,
  type FieldNavItem,
} from '@/lib/field/field-nav'
import { cn } from '@/components/ui/cn'

/**
 * เปลือกของ Field Tracker (`41` §5.1 mobile / §5.2 desktop)
 *
 * - **Mobile**: top bar (โลโก้กลับหน้าแรก + แฮมเบอร์เกอร์) + bottom nav 4 ปุ่มพร้อม badge
 * - **Desktop (`lg` ขึ้นไป)**: sidebar กว้าง **260px `position: fixed`** (ไม่ใช่ `sticky` — `41` §5.2)
 *   เนื้อหาเลื่อนเข้าด้วย `margin-left: 260px` · รายการเคสเป็นคอลัมน์เดียวเต็มความกว้างเสมอ
 *
 * ⚠️ ไม่ผ่าน `<AppShell>` ของหลังบ้าน (`06` §8) แต่ยัง**ใช้ตรรกะเมนูชุดเดียวกัน** ที่ `lib/field/field-nav.ts`
 * ⚠️ ซ่อน/แสดงเมนูเป็นแค่ UX — API ตรวจ `perform_field_work` ซ้ำทุก endpoint เสมอ (DEC-002)
 */

const NAV_ICON: Readonly<Record<FieldNavId, (props: { className?: string }) => ReactNode>> = {
  dashboard: IconHome,
  pending_accept: IconInbox,
  accepted: IconCalendar,
  tracking: IconCompass,
  closed: IconCheck,
  expenses: IconWallet,
  income: IconChart,
}

function NavBadge({ count, tone }: { count: number; tone: 'red' | 'purple' }) {
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
        tone === 'purple' ? 'bg-purple-600' : 'bg-red-500',
      )}
    >
      {count}
    </span>
  )
}

function BottomNav({ badges, activeId }: { badges: FieldBadgeCounts; activeId: FieldNavId | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.06)] lg:hidden">
      <div className="mx-auto grid max-w-[560px] grid-cols-4">
        {fieldBottomNavItems().map((item) => {
          const Icon = NAV_ICON[item.id]
          const count = fieldBadgeCount(item, badges)
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'focus-ring relative flex flex-col items-center gap-1 py-3',
                activeId === item.id ? 'text-slate-900' : 'text-slate-400',
              )}
            >
              {count !== null && item.badgeTone !== null && (
                <span className="absolute top-1 right-[22%]">
                  <NavBadge count={count} tone={item.badgeTone} />
                </span>
              )}
              <Icon className="h-5 w-5" />
              <span className="text-[11px] font-bold leading-none">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function MenuRow({
  item,
  badges,
  activeId,
  onNavigate,
}: {
  item: FieldNavItem
  badges: FieldBadgeCounts
  activeId: FieldNavId | null
  onNavigate?: () => void
}) {
  const Icon = NAV_ICON[item.id]
  const count = fieldBadgeCount(item, badges)
  const active = activeId === item.id

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'focus-ring flex items-center gap-3 rounded-lg px-3 py-3 text-left',
        active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
      )}
    >
      <Icon className={cn('h-5 w-5', active ? 'text-white' : 'text-slate-400')} />
      <span className="flex-1 text-sm font-semibold">{item.menuLabel}</span>
      {count !== null && item.badgeTone !== null && <NavBadge count={count} tone={item.badgeTone} />}
      <IconChevronRight className={cn('h-4 w-4', active ? 'text-white/70' : 'text-slate-300')} />
    </Link>
  )
}

function LogoutRow({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.replace(LOGIN_PATH)
      router.refresh()
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cn(
        'focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-red-600 hover:bg-red-50 disabled:opacity-60',
        compact && 'py-2.5',
      )}
    >
      <IconLogout className="h-5 w-5" />
      <span className="flex-1 text-sm font-semibold">{loading ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}</span>
    </button>
  )
}

function UserCard({ session }: { session: ClientSession }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span className="rounded-full bg-slate-100 p-2 text-slate-500">
        <IconUser className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-slate-900">{session.fullName}</div>
        <div className="truncate text-xs text-slate-400">{session.roleName}</div>
      </div>
    </div>
  )
}

function Sidebar({
  session,
  badges,
  activeId,
}: {
  session: ClientSession
  badges: FieldBadgeCounts
  activeId: FieldNavId | null
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-slate-200 bg-white lg:flex">
      <Link href="/field" className="focus-ring flex items-center gap-2 border-b border-slate-100 px-4 py-4">
        <span className="rounded-lg bg-slate-900 p-1.5 text-white">
          <IconTruck className="h-5 w-5" />
        </span>
        <span className="text-[15px] font-extrabold text-slate-900">AssetRecovery</span>
      </Link>

      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
        {fieldNavSections().map((section) => (
          <div key={section.section}>
            <div className="px-3 pb-1 text-[11px] font-extrabold tracking-wide text-slate-400 uppercase">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <MenuRow key={item.id} item={item} badges={badges} activeId={activeId} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 px-2 py-2">
        <UserCard session={session} />
        <LogoutRow compact />
      </div>
    </aside>
  )
}

function HamburgerDrawer({
  session,
  badges,
  activeId,
  onClose,
}: {
  session: ClientSession
  badges: FieldBadgeCounts
  activeId: FieldNavId | null
  onClose: () => void
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative flex h-full w-[82%] max-w-[360px] flex-col bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-2 py-2">
          <UserCard session={session} />
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดเมนู"
            className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {fieldNavSections().map((section) => (
            <div key={section.section}>
              <div className="px-3 pb-1 text-[11px] font-extrabold tracking-wide text-slate-400 uppercase">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <MenuRow key={item.id} item={item} badges={badges} activeId={activeId} onNavigate={onClose} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 px-2 py-2">
          <div className="px-3 pb-1 text-[11px] font-extrabold tracking-wide text-slate-400 uppercase">บัญชี</div>
          <LogoutRow />
        </div>
      </div>
    </div>
  )
}

function TopBar({ title, onOpenMenu }: { title: string; onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden">
      <div className="mx-auto flex h-16 max-w-[560px] items-center justify-between px-4">
        <Link href="/field" className="focus-ring flex items-center gap-2">
          <span className="rounded-lg bg-slate-900 p-1.5 text-white">
            <IconTruck className="h-5 w-5" />
          </span>
          <span className="text-[15px] font-extrabold text-slate-900">AssetRecovery</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="เปิดเมนู"
            className="focus-ring rounded-lg p-2 text-slate-700 hover:bg-slate-100"
          >
            <IconMenu className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-[560px] px-4 pt-1 pb-2">
        <h1 className="text-[20px] font-extrabold text-slate-900">{title}</h1>
      </div>
    </header>
  )
}

function ShellFrame({ session, children }: { session: ClientSession; children: ReactNode }) {
  const pathname = usePathname()
  const activeId = activeFieldNavId(pathname)
  const { badges } = useFieldCases()
  // ปิดเมนูเมื่อเปลี่ยนหน้า: ทำที่ `onNavigate` ของทุกแถวเมนูโดยตรง (ไม่ setState ใน effect)
  const [menuOpen, setMenuOpen] = useState(false)

  const title =
    activeId === null ? 'ติดตามภาคสนาม' : (fieldNavSections().flatMap((section) => section.items).find((item) => item.id === activeId)?.menuLabel ?? 'ติดตามภาคสนาม')

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar session={session} badges={badges} activeId={activeId} />

      <div className="lg:ml-[260px]">
        <TopBar title={title} onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[560px] px-4 pt-3 pb-28 lg:max-w-[960px] lg:px-8 lg:pt-8 lg:pb-12">
          <div className="mb-4 hidden items-center justify-between lg:flex">
            <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
            <NotificationBell />
          </div>
          {/* แบนเนอร์ A2HS / ปุ่มเปิดการแจ้งเตือน (`41` §15) — โผล่เฉพาะอุปกรณ์ที่เข้าเงื่อนไข */}
          <FieldPwaProvider />
          {children}
        </main>
      </div>

      <BottomNav badges={badges} activeId={activeId} />
      {menuOpen && (
        <HamburgerDrawer session={session} badges={badges} activeId={activeId} onClose={() => setMenuOpen(false)} />
      )}
    </div>
  )
}

export function FieldShell({ session, children }: { session: ClientSession; children: ReactNode }) {
  return (
    <PermissionProvider session={session}>
      <ToastProvider>
        <FieldCasesProvider>
          {/* auto-popup คำขอเปลี่ยนผู้รับผิดชอบอยู่ระดับ shell — เด้งได้ทุกหน้าใต้ `/field` (`41` §7.8) */}
          <FieldReassignmentProvider>
            <ShellFrame session={session}>{children}</ShellFrame>
          </FieldReassignmentProvider>
        </FieldCasesProvider>
      </ToastProvider>
    </PermissionProvider>
  )
}
