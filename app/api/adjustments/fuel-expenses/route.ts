import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { MANAGE_ACCOUNTING_PERIOD } from '@/lib/accounting/period'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listLockedFuelExpenses } from '@/lib/field/fuel-distance-job'

/**
 * `GET /api/adjustments/fuel-expenses` (มติ PO U135 · `41` §6.6 · `27` §6.8)
 * ค่าน้ำมันตามระยะทางที่คำนวณได้หลังงวดของวันปิดงานปิดแล้ว และรอ "สร้างรายการเบิกย้อนหลัง" พร้อมยอดที่คำนวณไว้
 *
 * อ่าน = การเงิน (`create_adjustment`) + บัญชี (`manage_accounting_period` — ได้รับแจ้งเตือนเรื่องเดียวกัน)
 */
export const GET = withApiPermission(
  'view',
  [CREATE_ADJUSTMENT, MANAGE_ACCOUNTING_PERIOD],
  toModuleErrorResponse,
  async (_request: Request, _context: unknown, user) => apiSuccess(await listLockedFuelExpenses(user)),
)
