import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/** รายงาน — 4 หมวด F/O/A/E รวม 17 รายงาน (ไฟล์ 96) · หน้าจริงเริ่ม Phase 6.1 */
export default async function ReportsPage() {
  await requireMenuPage('reports')
  return (
    <ModulePlaceholder
      menuId="reports"
      note="17 รายงาน 4 หมวด (F การเงิน / O งานติดตาม / A บัญชี / E Executive) ตามไฟล์ 96 — เริ่มลงมือใน Phase 6.1"
    />
  )
}
