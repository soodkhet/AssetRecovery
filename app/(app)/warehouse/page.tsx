import { pickParam } from '@/components/ui/url-state'
import { WarehouseManager } from '@/components/warehouse/warehouse-manager'
import { ASSET_TABS } from '@/lib/warehouse/asset-status'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * คลังสินค้า — 4 แท็บ รับเข้าคลัง/ในคลัง/รอส่งมอบ/ส่งมอบแล้ว (`44` §8 · `06` §7.1.1)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/assets` + `/api/handover-lots` ที่ตรวจ
 * `requirePermission()` และ scope ระดับแถวเองทุกครั้ง (DEC-002)
 */
export default async function WarehousePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireMenuPage('warehouse')
  const { tab } = await searchParams
  return <WarehouseManager initialTab={pickParam(tab, ASSET_TABS, 'intake')} />
}
