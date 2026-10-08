import { listClosedPeriodKeys } from '@/lib/accounting/period-guard'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { MANAGE_PAYOUT_BATCH } from '@/lib/payout/payout'
import { MANAGE_BILLING } from '@/lib/revenue/revenue'

/**
 * `GET /api/finance/closed-periods` (`27` §6.9 v3.20 · preship R7-009 · มติชั่วคราว P11)
 *
 * งวดบัญชีที่สร้างเอกสารใหม่ไม่ได้แล้ว — หน้าสร้างรอบวางบิล/รอบจ่ายใช้เลี่ยงการเสนอวันตัดรอบในงวดเหล่านี้
 * และเตือนทันทีเมื่อผู้ใช้เลือกวันในงวดปิด · read-only (ไม่เปิดงวดใหม่ ไม่ลง audit) · ยามจริงยังอยู่ที่ POST สร้างรอบ
 * สิทธิ์ = ผู้สร้างรอบวางบิลหรือรอบจ่าย (`25` §7.4)
 */
export const GET = withApiPermission(
  'view',
  [MANAGE_BILLING, MANAGE_PAYOUT_BATCH],
  toModuleErrorResponse,
  async (_request: Request, _context: unknown, user) =>
    apiSuccess({ closedPeriods: await listClosedPeriodKeys(user.organizationId) }),
)
