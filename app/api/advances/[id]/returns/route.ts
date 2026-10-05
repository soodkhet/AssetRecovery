import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { APPROVE_ADVANCE, recordAdvanceSeparateReturn } from '@/lib/advances/queries'
import { advanceSeparateReturnSchema } from '@/lib/advances/schemas'
import { getRequestMeta } from '@/lib/auth/request-meta'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/advances/:id/returns` (มติ PO 05/10/2569 UAT U30 · `15` §9.3 · `27` §6.4)
 * การเงินบันทึกรับคืนเงินทดรองแยก — ช่องทาง (เงินสด/โอน) + วันที่ + ยอด + หลักฐาน (path จาก
 * `/api/storage/upload-url` target `advance_return` · ตรวจไฟล์ฝั่ง server) → ยอดครบ = ปิดยอดคืน
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  APPROVE_ADVANCE,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = advanceSeparateReturnSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    return apiSuccess(
      await recordAdvanceSeparateReturn({ actor: user, meta: getRequestMeta(request) }, id, parsed.data),
      { status: 201 },
    )
  },
)
