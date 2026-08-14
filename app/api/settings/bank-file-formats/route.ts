import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createBankFileFormat, listBankFileFormats } from '@/lib/settings/queries/bank-file-formats'
import { bankFileFormatCreateSchema } from '@/lib/settings/schemas'

/**
 * รูปแบบไฟล์ธนาคาร (`13` §6.8 · §13) — `GET`/`POST /api/settings/bank-file-formats`
 * รูปแบบใหม่เริ่มที่ `test_status = pending` เสมอ — ใช้ตัดโอนจริงไม่ได้จนกว่าจะทดสอบผ่าน
 */

const listQuerySchema = z.object({ status: z.enum(['active', 'inactive', 'all']).default('active') })

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listBankFileFormats(user.organizationId, parsed.data.status) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = bankFileFormatCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const format = await createBankFileFormat({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: format }, { status: 201 })
  },
)
