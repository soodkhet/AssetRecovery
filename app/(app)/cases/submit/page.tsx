import { CasesManager } from '@/components/cases/cases-manager'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * จัดการเคส → รับเคส (`38` §5/§7 · `06` §7.1.1)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/cases` ที่ตรวจ `requirePermission()` เอง (DEC-002)
 */
export default async function CaseSubmitPage() {
  await requireMenuPage('cases.submit')
  return <CasesManager />
}
