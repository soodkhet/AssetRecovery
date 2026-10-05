import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { MANAGE_ACCOUNTING_PERIOD } from '@/lib/accounting/period'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listLockedFieldDays } from '@/lib/field/backdated-field-day'

/**
 * `GET /api/adjustments/field-days` (มติ PO 05/10/2569 U50 · `41` §6.6 · `27` §6.8)
 * วันลงพื้นที่ที่อยู่ในงวดปิดและรอ "สร้างรายการเบิกย้อนหลัง" พร้อมยอดที่คำนวณไว้
 *
 * อ่าน = การเงิน (`create_adjustment`) + บัญชี (`manage_accounting_period` — ได้รับแจ้งเตือนเรื่องเดียวกัน)
 */
export const GET = withApiPermission(
  'view',
  [CREATE_ADJUSTMENT, MANAGE_ACCOUNTING_PERIOD],
  toModuleErrorResponse,
  async (_request: Request, _context: unknown, user) => apiSuccess(await listLockedFieldDays(user)),
)
