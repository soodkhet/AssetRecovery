import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createExportPack } from '@/lib/exports/queries'
import { exportPackSchema } from '@/lib/exports/schemas'
import { EXPORT_ACCOUNTING_PACK } from '@/lib/exports/pack'

/** ประกอบไฟล์ PDF/Excel ต้องใช้ Node API — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `POST /api/accounting/export-pack` (`37` §14) — สร้างชุดใหม่ของรอบ → `generated`
 *
 * เช็ค Critical Exception ก่อนเสมอ (`EXPORT_BLOCKED_CRITICAL`) · export ซ้ำรอบเดิม = เวอร์ชันถัดไป
 * ไม่ทับของเดิม (`37` §6.2) · สิทธิ์ = `export_accounting_pack` ระดับ manage (บัญชี) — การเงิน/ผู้บริหาร
 * ดูประวัติได้แต่สร้างชุดใหม่ไม่ได้ (`37` §12)
 */
export const POST = withApiPermission(
  'manage',
  EXPORT_ACCOUNTING_PACK,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = exportPackSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await createExportPack({ actor: user, meta: getRequestMeta(request) }, parsed.data))
  },
)
