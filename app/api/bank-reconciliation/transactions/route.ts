import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listBankTransactions, MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/queries'
import { bankTransactionListQuerySchema } from '@/lib/bank-recon/schemas'

/**
 * `GET /api/bank-reconciliation/transactions` (`35` §14 · `27` §6.14)
 * อ่าน = บัญชี (จัดการ) + การเงิน (read-only) ตาม `25` §7.5
 */
export const GET = withApiPermission(
  'view',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = bankTransactionListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listBankTransactions(user, parsed.data))
  },
)
