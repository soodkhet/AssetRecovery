import { LogoutButton } from '@/components/auth/logout-button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { requireSessionPage } from '@/lib/auth/page-guard'

/**
 * Client Portal (ไฟล์ 97) — **placeholder ของ Phase 1.5**
 * ตั้งใจไม่อยู่ใน route group `(app)`: portal มีเมนู/เปลือกของตัวเอง และ `/api/portal/*` = GET เท่านั้น
 * หน้าจริงเกิดใน Phase 7.3 (🔒 ปลดล็อกเมื่อ PO ตอบเรื่อง Auth method — `97` §22 #2)
 */
export default async function ClientPortalPage() {
  const user = await requireSessionPage()

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">พอร์ทัลบริษัทไฟแนนซ์</h1>
          <p className="mt-0.5 text-xs text-slate-500">{user.fullName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>Phase 7.3</Badge>
          <LogoutButton />
        </div>
      </div>

      <Card padded={false}>
        <EmptyState
          title="พอร์ทัลอยู่ระหว่างพัฒนา"
          description="เมนู 6 รายการตามไฟล์ 97 (Desktop + Mobile) เกิดใน Phase 7.3 — ข้อมูลทุกหน้าจำกัดเฉพาะบริษัทของผู้ใช้เท่านั้น"
        />
      </Card>
    </main>
  )
}
