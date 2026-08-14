import type { NextRequest } from 'next/server'
import { withEndpoint } from '@/lib/api/http'
import { CASE_READ_CAPABILITIES } from '@/lib/cases/permissions'
import { listCaseTeamOptions } from '@/lib/cases/team-options-queries'
import type { CaseTeamOptionsDto } from '@/lib/cases/types'

/**
 * `GET /api/cases/team-options` (`38` §7.4 · `45` §6.1 v1.4)
 *
 * ทีม active ทั้งหมด + จังหวัดที่ดูแล + ค่าตั้งของแผนค่าตอบแทน — ฟอร์มรับเคสใช้จับคู่จังหวัดแบบ
 * real-time ด้วย `suggestTeam()` (pure ตัวเดียวกับฝั่ง API) ตั้งแต่ก่อนเคสถูกบันทึก
 */
export const GET = withEndpoint<unknown, CaseTeamOptionsDto>({
  endpoint: 'case.teamOptions',
  action: 'view',
  resource: CASE_READ_CAPABILITIES,
  handler: async (_request: NextRequest, _context, user) => {
    return { data: await listCaseTeamOptions(user) }
  },
})
