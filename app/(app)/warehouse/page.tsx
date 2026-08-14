import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/** คลังสินค้า — 4 แท็บ รับเข้าคลัง/ในคลัง/รอส่งมอบ/ส่งมอบแล้ว (ไฟล์ 44) · หน้าจริงเริ่ม Phase 2.14 */
export default async function WarehousePage() {
  await requireMenuPage('warehouse')
  return (
    <ModulePlaceholder
      menuId="warehouse"
      note="4 แท็บตามไฟล์ 44 (รับเข้าคลัง / ในคลัง / รอส่งมอบ / ส่งมอบแล้ว) — เริ่มลงมือใน Phase 2.14"
    />
  )
}
