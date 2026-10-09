import type { Metadata } from 'next'
import { CasesManager } from '@/components/cases/cases-manager'
import { parseCaseListParams } from '@/components/cases/case-list-params'
import { pickUuid } from '@/components/ui/url-state'
import { requireMenuPage } from '@/lib/nav/menu-guard'

export const metadata: Metadata = { title: 'รับเคส' }

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
  // ตัวกรอง/หน้า อยู่ใน URL (preship PS-013)
  const params = await searchParams
  const { filters, page } = parseCaseListParams((key) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  })
  return <CasesManager initialFilters={filters} initialPage={page} initialDetailCaseId={pickUuid(params.case)} />
}
