import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { ON_BEHALF_CAPABILITIES } from '@/lib/claims/claim'
import { listPayeeOptions } from '@/lib/payees/queries'

/**
 * `GET /api/payees/options` (มติ PO U153) — รายชื่อผู้รับเงินสำหรับช่อง "บันทึกแทน" ของฟอร์มเบิกด้วยมือ /
 * ขอเงินทดรอง · เฉพาะผู้ที่บันทึกแทนผู้อื่นได้ (`manage:approve_expense_finance` หรือ `manage:approve_advance`)
 * คืนแค่ id + ชื่อ + ทีม (ไม่มีข้อมูลบัญชี/ภาษี) · ยามบันทึกแทนตัวจริงอยู่ที่ชั้นข้อมูลของแต่ละ endpoint
 */
export const GET = withApiPermission(
  'manage',
  ON_BEHALF_CAPABILITIES,
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => apiSuccess(await listPayeeOptions(user)),
)
