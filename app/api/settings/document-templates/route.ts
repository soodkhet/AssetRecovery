import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { INTERNAL_DOCUMENT_TEMPLATES } from '@/lib/settings/catalogs'

/**
 * เอกสารภายในที่ระบบสร้างอัตโนมัติ (`13` §6.7 · §13) — **read-only**
 * รูปแบบ PDF จริงกำหนดที่ไฟล์ 28 (Phase 3.5) ไม่ใช่ค่าตั้งค่าในตาราง จึงไม่มี POST/PATCH
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest) => Response.json({ data: INTERNAL_DOCUMENT_TEMPLATES }),
)
