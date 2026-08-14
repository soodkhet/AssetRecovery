import Link from 'next/link'
import { Card, EmptyState } from '@/components/ui'

/**
 * หน้าของ Field Tracker ที่ shell พร้อมแล้วแต่เนื้อหายังไม่ถึงเฟส (`docs/01_PLAN.md` §2.11–§2.12)
 * ใช้แทนการซ่อนเมนู — เมนูตาม `41` §5 ต้องครบทุกช่อง ไม่งั้นโครงนำทางเพี้ยนจาก mockup
 */
export function FieldComingSoon({
  title,
  description,
  goTo,
}: {
  title: string
  description: string
  goTo?: { href: string; label: string }
}) {
  return (
    <Card padded={false}>
      <EmptyState
        title={title}
        description={description}
        action={
          goTo === undefined ? undefined : (
            <Link
              href={goTo.href}
              className="focus-ring rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {goTo.label}
            </Link>
          )
        }
      />
    </Card>
  )
}
