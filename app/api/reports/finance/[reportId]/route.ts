import { categoryAliasGet } from '@/app/api/reports/category-alias'

/** `GET /api/reports/finance/:name` — ชื่อพ้องของ `GET /api/reports/:reportId` (`96` §9) */
export const GET = categoryAliasGet('finance')
