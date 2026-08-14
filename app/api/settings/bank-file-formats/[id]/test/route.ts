import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { getBankFileFormat, testBankFileFormat } from '@/lib/settings/queries/bank-file-formats'
import { bankFileTestSchema } from '@/lib/settings/schemas'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `POST /api/settings/bank-file-formats/:id/test` (`13` §13) — รันทดสอบไฟล์ตัวอย่าง
 *
 * transition endpoint แยกตาม Rule 04 (`13` §8: `pending → passed|failed`) — เปลี่ยน `test_status`
 * ทางอื่นไม่ได้ · ผลลัพธ์ deterministic กดซ้ำได้ผลเดิม · **ผ่านแล้วเท่านั้นจึงใช้ตัดโอนจริงได้**
 * (`BANK_FILE_NOT_TESTED` — ตัว gate อยู่ `assertBankFileUsable()` ที่ Phase 3.4 เรียก)
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  'manage_settings',
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = bankFileTestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const current = await getBankFileFormat(user.organizationId, id)
    const { format, result } = await testBankFileFormat(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      current,
    )
    return Response.json({ data: { format, result } })
  },
)
