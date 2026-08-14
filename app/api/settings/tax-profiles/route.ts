import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { createTaxProfile, listTaxProfiles } from '@/lib/settings/queries/tax-profiles'
import { taxProfileCreateSchema } from '@/lib/settings/schemas'

/**
 * กติกาภาษี Payee (`13` §6.4 · §13) — `GET`/`POST /api/settings/tax-profiles`
 *
 * สิทธิ์แคบกว่าหมวดอื่น (`13` §11): แก้ = `manage:manage_tax_profiles` ซึ่งเป็น 1 ใน 9 รายการ
 * **ล็อกกับ Superadmin** (`lib/roles/capability-locks.ts` — มติ PO 14/08/2569) มอบต่อไม่ได้
 */

const listQuerySchema = z.object({ status: z.enum(['active', 'inactive', 'all']).default('active') })

export const GET = withApiPermission(
  'view',
  'view_master_data',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return Response.json({ data: await listTaxProfiles(user.organizationId, parsed.data.status) })
  },
)

export const POST = withApiPermission(
  'manage',
  'manage_tax_profiles',
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = taxProfileCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const { reason, ...values } = parsed.data
    const profile = await createTaxProfile({ actor: user, meta: getRequestMeta(request), reason }, values)
    return Response.json({ data: profile }, { status: 201 })
  },
)
