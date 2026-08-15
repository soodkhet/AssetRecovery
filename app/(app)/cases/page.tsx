import { redirect } from 'next/navigation'
import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { canViewMenu, findMenu } from '@/lib/nav/menu-registry'

/**
 * จัดการเคส — เมนูนี้ไม่มีหน้าของตัวเอง มีแต่แท็บย่อยตาม `06` §7.1.1
 * ผู้ใช้ที่เห็นแท็บย่อยให้เด้งไปแท็บแรกที่ตัวเองเข้าถึงได้ (รับเคส · มอบหมายงาน · ติดตามภาคสนาม — เสร็จครบแล้ว)
 *
 * เหลือ role เดียวที่ตกมาถึง placeholder = **บริษัทไฟแนนซ์** ซึ่ง `06` §7.2 ให้เห็นเมนูนี้
 * แต่ปลายทางจริงคือ Client Portal (ไฟล์ `97` — Phase 7 ยังบล็อกด้วยคำตอบ PO)
 */
export default async function CasesPage() {
  const user = await requireMenuPage('cases')

  const firstAvailable = (findMenu('cases')?.children ?? []).find(
    (child) => child.available && canViewMenu(user, child.id),
  )
  if (firstAvailable !== undefined) redirect(firstAvailable.path)

  return (
    <ModulePlaceholder
      menuId="cases"
      note="บัญชีนี้ยังไม่มีแท็บย่อยของ “จัดการเคส” ที่เข้าถึงได้ — ผู้ใช้ฝั่งบริษัทไฟแนนซ์ดูสถานะเคสได้ที่ Client Portal (ไฟล์ 97) เมื่อเปิดใช้งาน"
    />
  )
}
