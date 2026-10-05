import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listAdjustmentsAwaitingCreditNote } from '@/lib/credit-notes/queries'
import { AWAITING_CREDIT_NOTE_CAPABILITIES } from '@/lib/credit-notes/permissions'

/**
 * `GET /api/accounting/credit-notes/awaiting` — Adjustment ลดยอดที่อนุมัติแล้วแต่ยังไม่มีใบลดหนี้ (ป้าย "รอใบลดหนี้")
 * เปิดให้ผู้ที่เห็นหน้าใบกำกับ (บัญชี/การเงิน) และผู้ที่เห็นหน้า Adjustment (สร้าง/อนุมัติ)
 */
export const GET = withApiPermission(
  'view',
  AWAITING_CREDIT_NOTE_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: Request, _context: unknown, user) => apiSuccess(await listAdjustmentsAwaitingCreditNote(user)),
)
