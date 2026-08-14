import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { listTaxDocTemplates, updateTaxDocTemplate } from '@/lib/settings/queries/tax-doc-templates'
import { taxDocTemplateUpdateSchema } from '@/lib/settings/schemas'
import { LEGALLY_REQUIRED_DOCUMENT_FIELDS } from '@/lib/settings/tax-doc-template'

/**
 * รูปแบบเอกสารภาษีทางการ (`13` §6.13) — **endpoint ที่ `13` §13 ตกหล่น** (ตาราง API draft ไม่มีแถวนี้
 * ทั้งที่ §6.13 เป็น 1 ใน 13 หมวด) — `GET`/`PATCH /api/settings/tax-document-templates`
 *
 * ปรับได้แค่ภาพลักษณ์ · `legallyRequiredFields` ส่งไปให้ FE แสดงว่าฟิลด์ตามกฎหมาย **ปิดไม่ได้**
 * · 1 record ต่อ (องค์กร, ชนิดเอกสาร) ⇒ PATCH เป็น upsert ไม่มี POST/DELETE
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => {
    return Response.json({
      data: {
        templates: await listTaxDocTemplates(user.organizationId),
        legallyRequiredFields: LEGALLY_REQUIRED_DOCUMENT_FIELDS,
      },
    })
  },
)

export const PATCH = withApiPermission(
  'manage',
  'manage_tax_profiles',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = taxDocTemplateUpdateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, documentType, ...values } = parsed.data
    const template = await updateTaxDocTemplate(
      { actor: user, meta: getRequestMeta(request), reason },
      documentType,
      values,
    )
    return Response.json({ data: template })
  },
)
