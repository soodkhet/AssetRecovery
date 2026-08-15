import { FinanceShell } from '@/components/finance/finance-shell'
import { resolveFinanceOperationTab } from '@/lib/finance/operation-tabs'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * การเงิน — 9 แท็บตามไฟล์ 14–21 (`06` §8) เปิดใช้งานครบแล้ว (Phase 3.3–3.8)
 * "ผู้รับเงิน" เป็นลิงก์ข้ามไปหน้าตั้งค่าการเงินตาม mockup `settings.html` — ดู `lib/finance/operation-tabs.ts`
 *
 * `requireMenuPage()` = ยามระดับเมนู (UX) — สิทธิ์จริงถูกตรวจซ้ำที่ทุก endpoint (DEC-002)
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireMenuPage('finance')
  const { tab } = await searchParams
  return <FinanceShell initialTab={resolveFinanceOperationTab(tab)} />
}
