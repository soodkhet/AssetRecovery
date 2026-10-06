import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listMatchProposals, MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/queries'

/**
 * `GET /api/bank-reconciliation/match-proposals` — คู่ที่ระบบเสนอ (มติ PO 07/10/2569 U137 · จับคู่ทางกลับ)
 *
 * อ่านอย่างเดียว — สิทธิ์ `view` ของการกระทบยอดเหมือนรายการเดินบัญชี (`25` §7.4)
 * การยืนยันคู่ใช้ `PATCH /transactions/:id/match` เดิม (`manage` — สิทธิ์เดียวกับจับคู่มือ)
 */
export const GET = withApiPermission(
  'view',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (_request: Request, _context: unknown, user) => apiSuccess(await listMatchProposals(user)),
)
