import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listDocumentNumbering } from '@/lib/document-numbering/queries'

/**
 * เลขที่เอกสารทุกชนิด (มติ PO U102 · `13` §6.12) — `GET /api/settings/document-numbering`
 * อ่าน = `view_master_data` (แนวเดียวกับแท็บตั้งค่าอื่น) · แก้ไขที่ `/:docType` (`manage_invoice_numbering`)
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({ data: await listDocumentNumbering(user.organizationId) })
  },
)
