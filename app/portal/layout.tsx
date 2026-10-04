import type { ReactNode } from 'react'
import { PortalShell } from '@/components/portal/portal-shell'
import { visiblePortalSections } from '@/lib/portal/access'
import { requirePortalPage } from '@/lib/portal/page-guard'
import { findPortalCompanyName } from '@/lib/portal/queries/profile'

/**
 * Layout ของพอร์ทัลบริษัทไฟแนนซ์ (`97` §5/§7 · มติ PO 05/10/2569 U6/O43) — นอก route group `(app)`
 * เพราะมีเปลือกของตัวเอง (Top Bar + แท็บตามหมวดที่เห็น + bottom nav บนมือถือ)
 *
 * - `requirePortalPage()` ที่นี่กันทุกหน้าใต้ `/portal` · แต่ละ `page.tsx` เรียกซ้ำพร้อมหมวดของตัวเอง
 *   (layout ไม่ render ใหม่ตอนเปลี่ยนหน้า จึงตรวจหมวดที่ layout ไม่ได้)
 * - แท็บของหมวดที่ไม่มีสิทธิ์ถูกซ่อน — เป็น UX เท่านั้น ข้อมูลจริงตรวจที่ `/api/portal/*` (DEC-002)
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requirePortalPage()
  const companyName = (await findPortalCompanyName(user.organizationId, user.companyId)) ?? '—'

  return (
    <PortalShell companyName={companyName} userName={user.fullName} roleName={user.roleName} sections={visiblePortalSections(user)}>
      {children}
    </PortalShell>
  )
}
