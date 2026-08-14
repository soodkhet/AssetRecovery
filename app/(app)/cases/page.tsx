import { redirect } from 'next/navigation'
import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'
import { canViewMenu, findMenu } from '@/lib/nav/menu-registry'

/**
 * จัดการเคส — เมนูนี้ไม่มีหน้าของตัวเอง มีแต่แท็บย่อยตาม `06` §7.1.1
 * ผู้ใช้ที่เห็นแท็บย่อยที่หน้าจริงพร้อมแล้ว ให้เด้งไปแท็บแรกที่ตัวเองเข้าถึงได้
 * (ตอนนี้ = "รับเคส" Phase 2.4 · มอบหมายงาน 2.7 · ติดตามภาคสนาม 2.10 ตามมาทีหลัง)
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
      note="แท็บย่อยที่บัญชีนี้เข้าถึงได้แสดงอยู่บนแถบด้านบน — รับเคส (ไฟล์ 38, Phase 2.4) · มอบหมายงาน (ไฟล์ 40, Phase 2.7) · ติดตามภาคสนาม (ไฟล์ 41, Phase 2.10)"
    />
  )
}
