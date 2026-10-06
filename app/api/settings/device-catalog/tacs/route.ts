import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'
import { deviceTacBindSchema, deviceTacListQuerySchema } from '@/lib/device-catalog/schemas'
import { bindDeviceTac, listDeviceTacs } from '@/lib/device-catalog/tac-queries'

/**
 * ฐาน TAC ในหน้า Model Phone (มติ PO U166)
 * - `GET` ค้นหา TAC (พิมพ์ตัวเลข = ขึ้นต้นด้วย · พิมพ์คำ = ยี่ห้อ/รุ่น/รหัสรุ่น) + กรองแหล่ง + แบ่งหน้า
 * - `POST` ผู้ดูแลเพิ่ม/ผูก TAC กับรุ่นในแคตตาล็อกเอง (แหล่ง = ผู้ดูแลผูกเอง)
 */

export const GET = withApiPermission(
  'view',
  MANAGE_DEVICE_CATALOG_CAPABILITY,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceTacListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listDeviceTacs(user.organizationId, parsed.data) })
  },
)

export const POST = withApiPermission(
  'manage',
  MANAGE_DEVICE_CATALOG_CAPABILITY,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = deviceTacBindSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const saved = await bindDeviceTac({ actor: user, meta: getRequestMeta(request), reason: parsed.data.reason }, parsed.data)
    return Response.json({ data: saved }, { status: 201 })
  },
)
