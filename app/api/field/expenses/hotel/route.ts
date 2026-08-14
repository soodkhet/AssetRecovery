import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { submitHotelClaim } from '@/lib/field/expense-queries'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import { hotelClaimSchema } from '@/lib/field/schemas'
import type { FieldExpenseDto } from '@/lib/field/types'

/**
 * `POST /api/field/expenses/hotel` (`41` §6.6 กลุ่ม "เบิกแยก" · §7.9)
 * เบิกแยกไม่ผ่านขั้นคลัง — เข้า `pending_approval` ทันที · ผู้พักร่วมต้องอยู่ทีมเดียวกัน (validate ซ้ำฝั่ง BE)
 */
export const POST = withEndpoint<unknown, FieldExpenseDto>({
  endpoint: 'field.hotelClaim',
  action: 'manage',
  resource: FIELD_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = hotelClaimSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const data = await submitHotelClaim(user, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data, status: 201 }
  },
})
