import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { listFieldTeammates } from '@/lib/field/queries'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import type { FieldTeammateDto } from '@/lib/field/types'

/**
 * `GET /api/field/teammates` (`41` §6.6)
 * ตัวเลือก "พักร่วมกับ" ของฟอร์มเบิกที่พัก — เห็นเฉพาะคนใน**ทีมของผู้เรียกเอง** (ไม่รวมตัวเอง)
 * เงื่อนไขตรงกับยาม `assertSharedAgentInTeam()` ของ `POST /api/field/expenses/hotel`
 */
export const GET = withEndpoint<unknown, { items: FieldTeammateDto[] }>({
  endpoint: 'field.teammates',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (_request: NextRequest, _context, user) => {
    const items = await listFieldTeammates(user)
    return { data: { items } }
  },
})
