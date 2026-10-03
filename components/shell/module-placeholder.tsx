import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { findMenu, UNDER_DEVELOPMENT_TEXT } from '@/lib/nav/menu-registry'

/**
 * หน้า placeholder ของเมนูที่ยังไม่ถึงคิวพัฒนา — ให้ App Shell เดินได้ครบทุกเมนูตั้งแต่ Phase 1.5
 * โดยไม่หลอกว่าโมดูลเสร็จแล้ว (mockup `app-shell.html` `renderDashboardPlaceholder()` ใช้แนวเดียวกัน)
 */
export function ModulePlaceholder({ menuId, note }: { menuId: string; note?: string }) {
  const menu = findMenu(menuId)
  const label = menu?.label ?? menuId

  return (
    <>
      <PageHeader
        title={label}
        description="เมนูนี้ยังไม่เปิดใช้งาน"
        action={<Badge>{UNDER_DEVELOPMENT_TEXT}</Badge>}
      />
      <Card padded={false}>
        <EmptyState
          title={`โมดูล "${label}" ${UNDER_DEVELOPMENT_TEXT}`}
          description={note ?? 'หน้านี้จะเปิดใช้งานเร็ว ๆ นี้'}
        />
      </Card>
    </>
  )
}
