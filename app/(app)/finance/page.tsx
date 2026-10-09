import type { Metadata } from 'next'
import { FinanceShell } from '@/components/finance/finance-shell'
import { resolveFinanceOperationTab } from '@/lib/finance/operation-tabs'
import { requireMenuPage } from '@/lib/nav/menu-guard'

export const metadata: Metadata = { title: 'การเงิน' }

/**
 * การเงิน — 9 แท็บตามไฟล์ 14–21 (`06` §8) เปิดใช้งานครบแล้ว (Phase 3.3–3.8)
 * "ผู้รับเงิน" เรนเดอร์ในหน้านี้ตาม mockup `finance.html` (UAT R6-C) · แท็บที่ผู้ใช้ไม่มีสิทธิ์อ่านถูกซ่อน — ดู `lib/finance/operation-tabs.ts`
 *
 * `requireMenuPage()` = ยามระดับเมนู (UX) — สิทธิ์จริงถูกตรวจซ้ำที่ทุก endpoint (DEC-002)
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireMenuPage('finance')
  const { tab } = await searchParams
  return <FinanceShell initialTab={resolveFinanceOperationTab(tab, user)} />
}
