import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getSellerBranch, updateSellerBranch } from '@/lib/settings/queries/seller-branch'
import { sellerBranchUpdateSchema } from '@/lib/settings/schemas'

/**
 * สำนักงานใหญ่/สาขาของผู้ขาย (มติ PO U82 · ม.86/4) — `GET`/`PATCH /api/settings/seller-branch`
 *
 * สิทธิ์: อ่าน = `view:view_master_data` · แก้ = `manage:manage_invoice_numbering` (ล็อก Superadmin —
 * ค่าตั้งระดับองค์กรของใบกำกับภาษี อยู่แท็บเดียวกับรูปแบบเลขที่) · เหตุผลบังคับ (กระทบเอกสารภาษี)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await getSellerBranch(user.organizationId) })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_invoice_numbering',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = sellerBranchUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await updateSellerBranch(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      parsed.data.branchCode,
    )
    return Response.json({ data })
  },
)
