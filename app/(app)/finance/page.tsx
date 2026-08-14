import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/** การเงิน — 9 แท็บตามไฟล์ 14–21 (`06` §8) · หน้าจริงเริ่ม Phase 3.3 */
export default async function FinancePage() {
  await requireMenuPage('finance')
  return <ModulePlaceholder menuId="finance" note="9 แท็บตามไฟล์ 14–21 — เริ่มลงมือใน Phase 3.3 เป็นต้นไป" />
}
