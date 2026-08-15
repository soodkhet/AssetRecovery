import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listExportHistory } from '@/lib/exports/queries'
import { exportHistoryListQuerySchema } from '@/lib/exports/schemas'
import { EXPORT_READ_CAPABILITIES } from '@/lib/exports/pack'

/**
 * `GET /api/accounting/export-history` (`37` §14) — ประวัติการส่งมอบทุกเวอร์ชัน
 *
 * อ่านได้ทั้งบัญชี/การเงิน/ผู้บริหาร (`37` §12 — ดูประวัติเป็น read-only ของการเงินและผู้บริหาร)
 * · **ไม่มี DELETE โดยเจตนา** — ระเบียนเก่าเป็น audit trail ห้ามลบ (`37` §10)
 */
export const GET = withApiPermission(
  'view',
  EXPORT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = exportHistoryListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listExportHistory(user, parsed.data))
  },
)
