import { FinanceShell } from '@/components/finance/finance-shell'
import { resolveFinanceOperationTab } from '@/lib/finance/operation-tabs'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * การเงิน — 9 แท็บตามไฟล์ 14–21 (`06` §8) · เปิดจริงแล้ว 2 แท็บใน Phase 3.3
 * (รออนุมัติ = ไฟล์ 15 · ค่าตอบแทน = ไฟล์ 16) ที่เหลือทยอยเปิดตาม Phase 3.4–3.8
 *
 * `requireMenuPage()` = ยามระดับเมนู (UX) — สิทธิ์จริงถูกตรวจซ้ำที่ทุก endpoint (DEC-002)
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireMenuPage('finance')
  const { tab } = await searchParams
  return <FinanceShell initialTab={resolveFinanceOperationTab(tab)} />
}
