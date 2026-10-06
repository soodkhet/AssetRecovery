import { redirect } from 'next/navigation'
import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { canViewMenu, findMenu } from '@/lib/nav/menu-registry'
import { PORTAL_HOME_PATH } from '@/lib/portal/nav'

/**
 * จัดการเคส — เมนูนี้ไม่มีหน้าของตัวเอง มีแต่แท็บย่อยตาม `06` §7.1.1
 * ผู้ใช้ที่เห็นแท็บย่อยให้เด้งไปแท็บแรกที่ตัวเองเข้าถึงได้ (รับเคส · มอบหมายงาน · ติดตามภาคสนาม)
 *
 * ผู้ใช้**บริษัทไฟแนนซ์** (`06` §7.2 เห็นเมนูนี้) → ปลายทางจริงคือ Client Portal (`97` — เปิดใช้แล้ว)
 * เดิมตกไปที่ placeholder "เมื่อเปิดใช้งาน" ทั้งที่ Portal มีจริง (Final Test ด่าน 5)
 * placeholder เหลือไว้เฉพาะ role กำหนดเองที่ยังไม่ผูกแท็บย่อยใดเลย
 */
export default async function CasesPage() {
  const user = await requireMenuPage('cases')

  const firstAvailable = (findMenu('cases')?.children ?? []).find(
    (child) => child.available && canViewMenu(user, child.id),
  )
  if (firstAvailable !== undefined) redirect(firstAvailable.path)
  if (user.roleGroup === 'finance_company') redirect(`${PORTAL_HOME_PATH}/cases`)

  return (
    <ModulePlaceholder
      menuId="cases"
      note="บัญชีนี้ยังไม่มีแท็บย่อยของ “จัดการเคส” ที่เข้าถึงได้ — ติดต่อผู้ดูแลระบบเพื่อกำหนดสิทธิ์"
    />
  )
}
