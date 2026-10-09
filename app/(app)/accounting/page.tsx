import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AccountingShell } from '@/components/accounting/accounting-shell'
import { DASHBOARD_PATH } from '@/lib/auth/constants'
import { resolveAccountingTab } from '@/lib/accounting/accounting-tabs'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { canViewMenu, firstVisibleChildPath } from '@/lib/nav/menu-registry'

export const metadata: Metadata = { title: 'บัญชี' }

/**
 * บัญชี — 9 แท็บตามไฟล์ 30–37 (`06` §8) เปิดใช้งานครบแล้ว (Phase 4.2–4.7)
 *
 * `requireMenuPage()` = ยามระดับเมนู (UX) — สิทธิ์จริงถูกตรวจซ้ำที่ทุก endpoint (DEC-002)
 * ผู้ที่เห็นเมนูบัญชีแต่ไม่เห็น "งานบัญชี" (การเงินที่ถือสิทธิ์ดูตัวอย่างเอกสาร — มติ PO U104) ⇒ ไปเมนูย่อยแรกที่เห็น
 */
export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireMenuPage('accounting')
  if (!canViewMenu(user, 'accounting.operations')) {
    const target = firstVisibleChildPath(user, 'accounting')
    redirect(target === null || target === '/accounting' ? DASHBOARD_PATH : target)
  }
  const { tab } = await searchParams
  // แท็บที่ผู้ใช้ไม่มีสิทธิ์อ่านถูกซ่อน (BUG-158) — `?tab=` ที่ชี้แท็บนั้นตกกลับแท็บที่เห็น
  return <AccountingShell initialTab={resolveAccountingTab(tab, user)} />
}
