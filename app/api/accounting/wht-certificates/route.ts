import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { listWhtCertificates } from '@/lib/wht/queries'
import { whtCertificateListQuerySchema } from '@/lib/wht/schemas'
import { WHT_READ_CAPABILITIES } from '@/lib/wht/wht'

/**
 * `GET /api/accounting/wht-certificates` (`33` §14 · `27` §6.12) — ทะเบียนใบ 50 ทวิ
 *
 * รวมใบที่ยกเลิกไว้ด้วยเพื่อพิสูจน์ความต่อเนื่องของเลขที่ (ยอดของใบที่ยกเลิกไม่ถูกนับใน `summary`)
 * · **ไม่มี POST โดยเจตนา** — ใบเกิดอัตโนมัติจากรอบจ่ายที่ `completed` เท่านั้น (`33` §9)
 * · การเงินอ่านได้ (`25` §7.5 — `manage_wht` ระดับ view)
 */
export const GET = withApiPermission(
  'view',
  WHT_READ_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = whtCertificateListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(await listWhtCertificates(user, parsed.data))
  },
)
