import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { EXPORT_FORMATS } from '@/lib/settings/catalogs'

/**
 * รูปแบบไฟล์ Export ส่งสำนักงานบัญชี (`13` §6.9 · §13) — **read-only**
 * ชุดไฟล์ 01–08 ต้องครบเสมอ (`37` §6.1) ผู้ใช้เพิ่ม/ลบไม่ได้ จึงไม่มี POST/PATCH
 */
export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (_request: NextRequest) => Response.json({ data: EXPORT_FORMATS }),
)
