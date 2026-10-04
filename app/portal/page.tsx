import { LogoutButton } from '@/components/auth/logout-button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { UNDER_DEVELOPMENT_TEXT } from '@/lib/nav/menu-registry'
import { requirePortalPage } from '@/lib/portal/page-guard'

/**
 * Client Portal (ไฟล์ 97) — **placeholder ของ Phase 1.5**
 * ตั้งใจไม่อยู่ใน route group `(app)`: portal มีเมนู/เปลือกของตัวเอง และ `/api/portal/*` = GET เท่านั้น
 * หน้าจริงเกิดในก้อน Portal-P7+ (มติ PO 05/10/2569 U6)
 */
export default async function ClientPortalPage() {
  // ผู้ใช้ภายใน/Superadmin เด้งไปแดชบอร์ด · บริษัทถูกระงับเด้งไปหน้า login (มติ O43 D2/D5/D11)
  const user = await requirePortalPage()

  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">พอร์ทัลบริษัทไฟแนนซ์</h1>
          <p className="mt-0.5 text-xs text-slate-500">{user.fullName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{UNDER_DEVELOPMENT_TEXT}</Badge>
          <LogoutButton />
        </div>
      </div>

      <Card padded={false}>
        <EmptyState
          title="พอร์ทัลอยู่ระหว่างพัฒนา"
          description="เมนู 6 รายการ (Desktop + Mobile) จะเปิดใช้งานเร็ว ๆ นี้ — ข้อมูลทุกหน้าจำกัดเฉพาะบริษัทของผู้ใช้เท่านั้น"
        />
      </Card>
    </main>
  )
}
