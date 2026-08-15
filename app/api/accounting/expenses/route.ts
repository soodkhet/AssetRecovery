import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { EXPENSE_RECORD_READ_CAPABILITIES } from '@/lib/expenses/expense-record'
import { listExpenseRecords } from '@/lib/expenses/queries'
import { expenseRecordListQuerySchema } from '@/lib/expenses/schemas'

/**
 * `GET /api/accounting/expenses` (`32` §14) — แท็บ "ค่าใช้จ่าย"
 *
 * รายการเกิด**อัตโนมัติ**เมื่อรอบจ่ายเงินเปลี่ยนเป็น `completed` (`32` §6.1) ⇒ ไม่มี POST/DELETE
 * ที่นี่โดยเจตนา · การเงินอ่านได้อย่างเดียว (`32` §12)
 */
export const GET = withApiPermission(
  'view',
  EXPENSE_RECORD_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = expenseRecordListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listExpenseRecords(user, parsed.data))
  },
)
