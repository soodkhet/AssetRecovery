'use client'

import Link from 'next/link'
import { usePortalPageHref } from '@/components/portal/portal-scope'
import { cn } from '@/components/ui/cn'
import { PORTAL_FINANCE_TABS, type PortalFinanceTab } from '@/lib/portal/nav'

/** staging E-076 — segmented control รอบวางบิล / ใบกำกับภาษี บนมือถือ (จอใหญ่มีแท็บบนอยู่แล้ว) */
export function PortalFinanceTabs({ active }: { active: PortalFinanceTab['key'] }) {
  const pageHref = usePortalPageHref()
  return (
    <nav aria-label="หมวดการเงิน" className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 md:hidden">
      {PORTAL_FINANCE_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={pageHref(tab.href)}
          aria-current={tab.key === active ? 'page' : undefined}
          className={cn(
            'focus-ring rounded-md px-3 py-2 text-center text-sm font-semibold pointer-coarse:min-h-11',
            tab.key === active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
