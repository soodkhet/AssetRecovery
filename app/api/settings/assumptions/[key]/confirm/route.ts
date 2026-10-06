import type { NextRequest } from 'next/server'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import {
  CONFIRM_SETTING_ASSUMPTION,
  settingAssumptionConfirmSchema,
  settingAssumptionKeySchema,
} from '@/lib/settings/assumptions'
import { confirmSettingAssumption } from '@/lib/settings/queries/assumptions'

type RouteContext = { params: Promise<{ key: string }> }

/**
 * `POST /api/settings/assumptions/:key/confirm` (มติ PO 07/10/2569 U140) — ป้าย "รอนักบัญชียืนยัน" หาย
 * เหตุผลบังคับ (อ้างอิงคำตอบนักบัญชี) + audit · key นอกทะเบียน = 400 · ยืนยันซ้ำ = คืนสถานะเดิม
 */
export const POST = withApiPermission<RouteContext>(
  'manage',
  CONFIRM_SETTING_ASSUMPTION,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { key } = await context.params
    const parsedKey = settingAssumptionKeySchema.safeParse(key)
    if (!parsedKey.success) return validationErrorResponse(parsedKey.error)
    const parsed = settingAssumptionConfirmSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const status = await confirmSettingAssumption(
      { actor: user, meta: getRequestMeta(request), reason: parsed.data.reason },
      parsedKey.data,
    )
    return Response.json({ data: status }, { status: 201 })
  },
)
