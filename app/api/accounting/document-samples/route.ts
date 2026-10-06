import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { DOCUMENT_SAMPLES_CAPABILITY } from '@/lib/documents/samples/catalog'
import { listDocumentSamples } from '@/lib/documents/samples/queries'

/**
 * `GET /api/accounting/document-samples` — ทะเบียน "ตัวอย่างเอกสารทั้งหมด" (มติ PO U104)
 *
 * สิทธิ์ = `view_document_samples` (บัญชี/การเงิน/บริหาร · Superadmin โดยนิยาม) · อ่านอย่างเดียว
 * · เลขตัวอย่าง = เลขถัดไปตามค่าตั้งเลขที่เอกสาร (SELECT ล้วน — ไม่เดินตัวนับ)
 */
export const GET = withApiPermission(
  'view',
  DOCUMENT_SAMPLES_CAPABILITY,
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => apiSuccess(await listDocumentSamples(user.organizationId)),
)
