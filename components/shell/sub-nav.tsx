'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/components/ui/cn'
import { type MenuItem, UNDER_DEVELOPMENT_TEXT } from '@/lib/nav/menu-registry'

/**
 * แถบแท็บย่อยใต้ Top Nav (`06` §8 · mockup `app-shell.html` `renderCaseSubNav()`)
 * หาเมนูหลักที่กำลังเปิดอยู่จาก pathname เอง แล้วแสดงแท็บย่อยที่ผู้ใช้คนนี้เห็น (กรองมาจาก server แล้ว)
 * แท็บที่หน้าจริงยังไม่เกิด (`available = false`) แสดงเป็น disabled พร้อมบอก phase — ไม่พาไปหน้า 404
 */
export function SubNav({ menus, className }: { menus: readonly MenuItem[]; className?: string }) {
  const pathname = usePathname()

  const active = menus.find((menu) => pathname === menu.path || pathname.startsWith(`${menu.path}/`))
  const items = active?.children ?? []
  if (items.length === 0) return null
  // แท็บที่ตรง pathname **ยาวที่สุด** = แท็บปัจจุบัน — แท็บที่ชี้หน้าแม่ (เช่น "งานบัญชี" = `/accounting`)
  // ต้องไม่ติดไฮไลต์ตอนอยู่หน้าลูก `/accounting/document-samples` (มติ PO U104)
  const currentPath = items
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .reduce<string | null>((best, item) => (best === null || item.path.length > best.length ? item.path : best), null)

  return (
    <div className={cn('flex-shrink-0 border-b border-slate-200 bg-slate-50', className)}>
      <nav
        aria-label="แท็บย่อย"
        className="no-scrollbar mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8"
      >
        {items.map((item) => {
          const current = item.path === currentPath

          if (!item.available) {
            return (
              <span
                key={item.id}
                title={UNDER_DEVELOPMENT_TEXT}
                className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-400"
              >
                {item.label}
                <span className="ml-1 text-[10px] text-slate-300">{UNDER_DEVELOPMENT_TEXT}</span>
              </span>
            )
          }

          return (
            <Link
              key={item.id}
              href={item.path}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'focus-ring-inset rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                current
                  ? 'border border-slate-300 bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
