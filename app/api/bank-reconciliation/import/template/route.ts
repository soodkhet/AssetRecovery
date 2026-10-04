import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getStatementImportTemplate, MANAGE_BANK_RECONCILIATION } from '@/lib/bank-recon/queries'
import { statementTemplateQuerySchema } from '@/lib/bank-recon/schemas'

/**
 * `GET /api/bank-reconciliation/import/template?bank_account_id=` — ไฟล์ตัวอย่างสำหรับนำเข้า statement
 * (มติ PO 04/10/2569 — UAT แม่แบบนำเข้าภาษาไทย)
 *
 * สิทธิ์เดียวกับตัวนำเข้า (`manage` กระทบยอดธนาคาร) เพราะแม่แบบเผยรูปแบบไฟล์ที่ตั้งไว้กับบัญชี ·
 * คืน envelope ที่มีเนื้อ CSV (UTF-8 + BOM) + คำอธิบายคอลัมน์ ⇒ หน้าจอแสดงคำอธิบายและสร้างไฟล์ให้ดาวน์โหลดจากคำขอเดียว
 */
export const GET = withApiPermission(
  'manage',
  MANAGE_BANK_RECONCILIATION,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = statementTemplateQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await getStatementImportTemplate(user, parsed.data.bank_account_id ?? null))
  },
)
