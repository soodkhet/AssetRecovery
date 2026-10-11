import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { resolveHotelReceiptRequiredForUser } from '@/lib/field/expense-queries'
import { listFieldTeammates } from '@/lib/field/queries'
import { FIELD_CAPABILITY } from '@/lib/field/permissions'
import type { FieldTeammateDto } from '@/lib/field/types'

/**
 * `GET /api/field/teammates` (`41` §6.6)
 * ตัวเลือก "พักร่วมกับ" ของฟอร์มเบิกที่พัก — เห็นเฉพาะคนใน**ทีมของผู้เรียกเอง** (ไม่รวมตัวเอง)
 * เงื่อนไขตรงกับยาม `assertSharedAgentInTeam()` ของ `POST /api/field/expenses/hotel`
 * + `hotelReceiptRequired` — แผนของทีม ณ วันนี้บังคับใบเสร็จค่าที่พัก (มติชั่วคราว M2) ⇒ ฟอร์มซ่อน "ไม่มีใบเสร็จ"
 *   (UX เท่านั้น — server ตรวจซ้ำตามแผนที่มีผล ณ วันที่เข้าพัก)
 */
export const GET = withEndpoint<unknown, { items: FieldTeammateDto[]; hotelReceiptRequired: boolean }>({
  endpoint: 'field.teammates',
  action: 'view',
  resource: FIELD_CAPABILITY,
  handler: async (_request: NextRequest, _context, user) => {
    const [items, hotelReceiptRequired] = await Promise.all([
      listFieldTeammates(user),
      resolveHotelReceiptRequiredForUser(user, new Date()),
    ])
    return { data: { items, hotelReceiptRequired } }
  },
})
