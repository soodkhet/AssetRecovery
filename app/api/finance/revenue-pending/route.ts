import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listRevenuePendingCases } from '@/lib/revenue/pending-queries'
import { BILLING_READ_CAPABILITIES } from '@/lib/revenue/queries'

/**
 * `GET /api/finance/revenue-pending` (staging E-008 · `27` §6.9) — เคสที่ปิดงานแล้วแต่รายได้ยังไม่เกิด
 * พร้อมเหตุผลตามเกต `19` §6.1 · อ่านอย่างเดียว (ไม่สร้างรายได้ · ไม่ลง audit) · สิทธิ์อ่านเดียวกับรายการรายได้
 */
export const GET = withApiPermission(
  'view',
  BILLING_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: Request, _context: unknown, user) => apiSuccess(await listRevenuePendingCases(user)),
)
