import { CasesManager } from '@/components/cases/cases-manager'
import { pickPage, pickUuid } from '@/components/ui/url-state'
import { requireMenuPage } from '@/lib/nav/menu-guard'

/**
 * จัดการเคส → รับเคส (`38` §5/§7 · `06` §7.1.1)
 * route guard เป็นชั้น UX — ข้อมูลจริงมาจาก `/api/cases` ที่ตรวจ `requirePermission()` เอง (DEC-002)
 */
export default async function CaseSubmitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireMenuPage('cases.submit')
  // ตัวกรอง/หน้า อยู่ใน URL (preship PS-013) — ค่าแปลก ๆ ไม่อันตราย: API ตรวจ query ซ้ำด้วย Zod เสมอ
  const params = await searchParams
  const text = (key: string, fallback: string) => {
    const value = params[key]
    const single = Array.isArray(value) ? value[0] : value
    return single === undefined || single === '' ? fallback : single.slice(0, 100)
  }
  return (
    <CasesManager
      initialFilters={{
        search: text('search', ''),
        status: text('status', 'all'),
        sourceChannel: text('source', 'all'),
        financeCompanyId: text('company', 'all'),
        province: text('province', 'all'),
      }}
      initialPage={pickPage(params.page)}
      initialDetailCaseId={pickUuid(params.case)}
    />
  )
}
