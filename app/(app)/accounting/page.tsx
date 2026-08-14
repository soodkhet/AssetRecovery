import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/** บัญชี — 9 แท็บตามไฟล์ 30–37 (`06` §8) · หน้าจริงเริ่ม Phase 4.7 */
export default async function AccountingPage() {
  await requireMenuPage('accounting')
  return <ModulePlaceholder menuId="accounting" note="9 แท็บตามไฟล์ 30–37 — เริ่มลงมือใน Phase 4.7" />
}
