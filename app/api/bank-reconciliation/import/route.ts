import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { importStatement, MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/queries'
import { statementImportSchema } from '@/lib/bank-recon/schemas'

/**
 * `POST /api/bank-reconciliation/import` (`35` §14 · `27` §6.14) — นำเข้า Bank Statement
 *
 * จัดการได้เฉพาะบัญชี (`25` §7.5) · ระบบผูกงวดให้เองจากวันที่ในไฟล์ (`ensurePeriodForDate()` 4.1)
 * แล้ว auto-match รายการที่ยอดตรงเป๊ะและมีผู้สมัครรายเดียวทันที (`35` §6.2)
 */
export const POST = withApiPermission(
  'manage',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = statementImportSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await importStatement({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(result, { status: 201 })
  },
)
