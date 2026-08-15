import { AccountingShell } from '@/components/accounting/accounting-shell'
import { resolveAccountingTab } from '@/lib/accounting/accounting-tabs'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * บัญชี — 9 แท็บตามไฟล์ 30–37 (`06` §8) เปิดใช้งานครบแล้ว (Phase 4.2–4.7)
 *
 * `requireMenuPage()` = ยามระดับเมนู (UX) — สิทธิ์จริงถูกตรวจซ้ำที่ทุก endpoint (DEC-002)
 */
export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireMenuPage('accounting')
  const { tab } = await searchParams
  return <AccountingShell initialTab={resolveAccountingTab(tab)} />
}
