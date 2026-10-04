import type { PortalNavKey } from '@/lib/portal/nav'

/** ไอคอนเส้นของพอร์ทัล — path เดียวกับ mockup `97-client-portal-mockup.html` (`SVG.*`) */
const PATHS: Readonly<Record<PortalNavKey | 'finance' | 'menu' | 'close', string>> = {
  overview: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zm0 8h8v10h-8V11zM3 14h8v7H3v-7z',
  cases:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  billing:
    'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z',
  finance:
    'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z',
  'tax-invoices':
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  handover: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  company: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 18L18 6M6 6l12 12',
}

export function PortalIcon({ name, className = 'h-4 w-4' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={PATHS[name]} />
    </svg>
  )
}

/** โลโก้ AssetRecovery (โล่) — ชุดเดียวกับ Top Nav ของ Back Office */
export function PortalLogo() {
  return (
    <span className="rounded bg-slate-900 p-2 text-white">
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2c.42.1.76.47.76.97Z" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    </span>
  )
}
