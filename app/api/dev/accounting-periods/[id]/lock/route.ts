import { devPeriodCloseRoute } from '@/lib/accounting/dev-period-close'

/**
 * `POST /api/dev/accounting-periods/:id/lock` — ทางลัด dev: ล็อกงวดด้วยวันที่จำลอง
 * (มติ PO 05/10/2569 U65) · production = 404 · สิทธิ์เดียวกับ `PATCH /api/accounting/periods/:id/lock`
 * body: `{ "reason": "...", "asOf": "YYYY-MM-DD" }`
 */
export const POST = devPeriodCloseRoute('lock')
