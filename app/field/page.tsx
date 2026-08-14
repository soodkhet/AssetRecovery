import { LogoutButton } from '@/components/auth/logout-button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireSessionPage } from '@/lib/auth/page-guard'

/**
 * Field Tracker (ไฟล์ 41) — **placeholder ของ Phase 1.5**
 * ตั้งใจไม่อยู่ใน route group `(app)`: หน้าจริงเป็น mobile-first + Desktop sidebar 260px `position: fixed`
 * ใช้ shell ของตัวเอง (`41` §11) ไม่ใช่ Top Nav — โครงจริงเกิดใน Phase 2.10
 */
export default async function FieldTrackerPage() {
  const user = await requireSessionPage()

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">ติดตามภาคสนาม</h1>
          <p className="mt-0.5 text-xs text-slate-500">{user.fullName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>Phase 2.10</Badge>
          <LogoutButton />
        </div>
      </div>

      <Card padded={false}>
        <EmptyState
          title="หน้าจอ Field Tracker อยู่ระหว่างพัฒนา"
          description="โครงหน้าจริง (งานรายวัน / ปิดงาน / เบิกค่าใช้จ่าย) ตามไฟล์ 41 เกิดใน Phase 2.10 — Mobile กับ Desktop ใช้ logic เดียวกัน 100%"
        />
      </Card>
    </main>
  )
}
