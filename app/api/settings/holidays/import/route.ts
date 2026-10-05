import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { importHolidays } from '@/lib/settings/queries/holidays'
import { holidayImportSchema } from '@/lib/settings/schemas'

/**
 * นำเข้าวันหยุดหลายวันทีเดียว (มติ PO 06/10/2569 UAT U93 · `13` §6.15) — `POST /api/settings/holidays/import`
 * client แยกข้อความ/ไฟล์ CSV ด้วย `parseHolidayImport()` แล้วส่งรายการมา · วันที่มีอยู่แล้วถูกข้าม (ไม่ปฏิเสธทั้งชุด)
 */
export const POST = withApiPermission(
  'manage',
  'manage_holidays',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = holidayImportSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const result = await importHolidays(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      parsed.data.items,
    )
    return Response.json({ data: result }, { status: 201 })
  },
)
