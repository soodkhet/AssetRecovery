import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  createCompanyDocument,
  listCompanyDocuments,
  MANAGE_COMPANIES,
  VIEW_COMPANY_DOCUMENTS,
} from '@/lib/finance-companies/document-queries'
import { companyDocumentCreateSchema } from '@/lib/finance-companies/documents'

type RouteContext = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

/**
 * เอกสารบริษัทไฟแนนซ์ (มติ PO U132 · `10` §7.4)
 *
 * - `GET` — ทุกเวอร์ชัน + คำเตือน (ไม่บล็อก) · `view:view_master_data` · ผู้ใช้ฝั่งบริษัท = 403 (พอร์ทัลไม่แสดง)
 * - `POST { documentType, title?, issuedDate?, path, originalName, replacesDocumentId?, reason }` — ผูกไฟล์ที่อัปโหลด
 *   ผ่าน `POST /api/storage/upload-url` (target `company_document`) · `manage:manage_companies` (Superadmin เท่านั้น)
 *   · ไม่มี DELETE/PATCH — เก็บทุกเวอร์ชัน (แทนที่ = POST พร้อม `replacesDocumentId`)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  VIEW_COMPANY_DOCUMENTS,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    return Response.json({ data: await listCompanyDocuments(user, id) })
  },
)

export const POST = withApiPermission<RouteContext>(
  'manage',
  MANAGE_COMPANIES,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = companyDocumentCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const document = await createCompanyDocument(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      id,
      parsed.data,
    )
    return Response.json({ data: document }, { status: 201 })
  },
)
