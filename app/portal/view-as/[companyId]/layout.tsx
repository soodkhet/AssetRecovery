import type { ReactNode } from 'react'
import { PortalShell } from '@/components/portal/portal-shell'
import { PORTAL_SECTIONS } from '@/lib/portal/access'
import { pageRequestMeta, recordPortalViewAsOpen, requirePortalViewAsPage } from '@/lib/portal/view-as-page'

/** หน้าบริษัทไฟแนนซ์ของระบบภายใน — ปลายทางของลิงก์ "กลับระบบภายใน" */
const INTERNAL_COMPANIES_PATH = '/settings/companies'

/**
 * Layout ของโหมด "ดู portal ในฐานะลูกค้า" (มติ PO U59 · `97` §13.1) — `/portal/view-as/<companyId>/...`
 *
 * - `requirePortalViewAsPage()` กันทุกหน้า: ผู้ใช้บริษัท → `/portal` ของตัวเอง · ไม่มีสิทธิ์ → `/dashboard` ·
 *   บริษัทไม่มีใน org → 404 · แต่ละ `page.tsx` เรียกซ้ำ (layout ไม่ render ใหม่ตอนเปลี่ยนหน้า)
 * - เห็นทุกหมวดแบบผู้จัดการของบริษัท · ข้อมูลจริงมาจาก `/api/portal/*?as=<id>` ที่ตรวจสิทธิ์เอง (DEC-002)
 * - ลง audit `view_as` ครั้งแรกต่อ session ต่อบริษัท (ที่ layout จุดเดียว — กันลงซ้ำจาก page)
 */
export default async function PortalViewAsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const { user, company } = await requirePortalViewAsPage(companyId)
  await recordPortalViewAsOpen(user, company, await pageRequestMeta())

  return (
    <PortalShell
      companyName={company.name}
      userName={user.fullName}
      roleName={user.roleName}
      sections={PORTAL_SECTIONS}
      viewAs={{ companyId: company.id, suspended: company.status !== 'active', backHref: INTERNAL_COMPANIES_PATH }}
    >
      {children}
    </PortalShell>
  )
}
