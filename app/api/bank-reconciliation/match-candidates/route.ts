import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listMatchCandidates, MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/queries'
import { matchCandidateQuerySchema } from '@/lib/bank-recon/schemas'

/**
 * `GET /api/bank-reconciliation/match-candidates` (`27` §6.14 v3.6)
 *
 * dropdown ของ Modal "จับคู่ Manual" (`35` §8) — ผู้ถือ `manage_bank_reconciliation` (บัญชี)
 * ไม่มีสิทธิ์เรียก `/api/billing-batches` / `/api/payout-batches` (`25` §7.4 = ของการเงิน)
 * จึงต้องอ่านผู้สมัครผ่าน endpoint ของโมดูล 35 เอง — คืนเฉพาะฝั่งที่ตรงกับเครื่องหมายของรายการ
 */
export const GET = withApiPermission(
  'view',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = matchCandidateQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listMatchCandidates(user, parsed.data))
  },
)
