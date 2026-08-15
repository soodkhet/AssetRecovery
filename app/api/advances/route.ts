import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVE_ADVANCE, createAdvance, listAdvances, REQUEST_ADVANCE } from '@/lib/advances/queries'
import { advanceCreateSchema, advanceListQuerySchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

/**
 * เงินทดรองจ่าย (`15` §14 · `27` §6.4) — `GET`/`POST /api/advances`
 *
 * อ่าน = `view` ของ `request_advance` (พนักงาน — เห็นเฉพาะของตัวเอง) **หรือ** `approve_advance`
 * (การเงิน/ผู้อนุมัติ — เห็นทั้งองค์กร) · scope ระดับแถวบังคับในชั้นข้อมูล (`25` §7.2)
 *
 * ขอเบิก = `manage:request_advance` — การเงินถือแค่ `view` ตาม `25` §7.2 จึงขอเบิกเองไม่ได้
 * (ยาม "ห้ามเบิกซ้อน" อยู่ในชั้นข้อมูล 2 ชั้น: pre-check + partial unique ของ DB)
 */

export const GET = withApiPermission(
  'view',
  [REQUEST_ADVANCE, APPROVE_ADVANCE],
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = advanceListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listAdvances(user, parsed.data))
  },
)

export const POST = withApiPermission(
  'manage',
  REQUEST_ADVANCE,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = advanceCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createAdvance({ actor: user, meta: getRequestMeta(request) }, parsed.data)
    return apiSuccess(created, { status: 201 })
  },
)
