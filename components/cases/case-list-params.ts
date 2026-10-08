import { pickPage } from '@/components/ui/url-state'

/** ตัวกรองรายการเคสหน้ารับเคส — ผูกกับ URL (preship PS-013) */
export interface CaseListFilters {
  search: string
  status: string
  sourceChannel: string
  financeCompanyId: string
  province: string
}

export const EMPTY_CASE_LIST_FILTERS: CaseListFilters = {
  search: '',
  status: 'all',
  sourceChannel: 'all',
  financeCompanyId: 'all',
  province: 'all',
}

/**
 * อ่านตัวกรอง/หน้าจาก query — ใช้ทั้ง page (server `searchParams`) และ `CasesManager` (URL จริงของ browser ตอน
 * Back กลับมา — preship R6-004) ด้วยกติกาเดียวกัน ⇒ hydrate ไม่ mismatch · ค่าแปลก ๆ ไม่อันตราย: API ตรวจ query ซ้ำด้วย Zod
 */
export function parseCaseListParams(get: (key: string) => string | null | undefined): {
  filters: CaseListFilters
  page: number
} {
  const text = (key: string, fallback: string) => {
    const value = get(key)
    return value === null || value === undefined || value === '' ? fallback : value.slice(0, 100)
  }
  return {
    filters: {
      search: text('search', ''),
      status: text('status', 'all'),
      sourceChannel: text('source', 'all'),
      financeCompanyId: text('company', 'all'),
      province: text('province', 'all'),
    },
    page: pickPage(get('page') ?? undefined),
  }
}
