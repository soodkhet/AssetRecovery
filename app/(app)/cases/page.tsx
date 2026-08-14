import { ModulePlaceholder } from '@/components/shell/module-placeholder'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/** จัดการเคส — แท็บย่อยตาม `06` §7.1.1 อยู่บนแถบ Sub-Nav · หน้าจริงเริ่ม Phase 2.4 (ไฟล์ 38) */
export default async function CasesPage() {
  await requireMenuPage('cases')
  return (
    <ModulePlaceholder
      menuId="cases"
      note="แท็บย่อยที่บัญชีนี้เข้าถึงได้แสดงอยู่บนแถบด้านบน — รับเคส (ไฟล์ 38, Phase 2.4) · มอบหมายงาน (ไฟล์ 40, Phase 2.7) · ติดตามภาคสนาม (ไฟล์ 41, Phase 2.10)"
    />
  )
}
