import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createVatRate, listVatRates, resolveVatRate } from '@/lib/settings/queries/vat-rates'
import { vatRateCreateSchema, vatRateResolveQuerySchema } from '@/lib/settings/schemas'

/**
 * อัตรา VAT แบบ effective-dated (`13` §6.5 · §13) — `GET`/`POST /api/settings/vat-rates`
 *
 * `GET ?date=YYYY-MM-DD` = **resolve อัตราที่มีผล ณ วันนั้น** (`19` §6.3) — ไม่มีช่วงครอบคลุมตอบ
 * `VAT_RATE_NOT_FOUND` **ห้าม fallback เป็น 7%** (Rule 01) · ไม่ส่ง `date` = ไทม์ไลน์ทั้งหมด
 *
 * เพิ่มอัตราที่ช่วงทับของเดิม → `VAT_RATE_OVERLAP` พร้อมรายการช่วงที่ทับ (`13` §10/§15)
 */

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const params = new URL(request.url).searchParams
    const date = params.get('date')
    if (date === null) return Response.json({ data: await listVatRates(user.organizationId) })

    const parsed = vatRateResolveQuerySchema.safeParse({ date })
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await resolveVatRate(user.organizationId, parsed.data.date) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_tax_profiles',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = vatRateCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const rate = await createVatRate({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: rate }, { status: 201 })
  },
)
