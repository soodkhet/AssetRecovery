import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { findMenu } from '@/lib/nav/menu-registry'

/**
 * หน้า placeholder ของเมนูที่ยังไม่ถึงคิวพัฒนา — ให้ App Shell เดินได้ครบทุกเมนูตั้งแต่ Phase 1.5
 * โดยไม่หลอกว่าโมดูลเสร็จแล้ว (mockup `app-shell.html` `renderDashboardPlaceholder()` ใช้แนวเดียวกัน)
 */
export function ModulePlaceholder({ menuId, note }: { menuId: string; note?: string }) {
  const menu = findMenu(menuId)
  const label = menu?.label ?? menuId
  const phase = menu?.plannedPhase

  return (
    <>
      <PageHeader
        title={label}
        description="เมนูนี้ยังไม่มีหน้าจริง — App Shell (Phase 1.5) ทำให้เมนูเดินได้ครบก่อน"
        action={phase !== undefined ? <Badge>Phase {phase}</Badge> : undefined}
      />
      <Card padded={false}>
        <EmptyState
          title={`โมดูล "${label}" อยู่ระหว่างพัฒนา`}
          description={
            note ??
            (phase !== undefined
              ? `หน้าจริงพร้อมใช้งานใน Phase ${phase} ตามลำดับงานใน PROGRESS.md`
              : 'หน้าจริงจะเกิดตามลำดับงานใน PROGRESS.md')
          }
        />
      </Card>
    </>
  )
}
