import { dateOnlyKey } from '@/lib/format/datetime'
import type { prisma } from '@/lib/prisma'

/**
 * คีย์วันหยุด (`YYYY-MM-DD`) ของปฏิทินองค์กรที่ยังไม่ถูกลบ (มติ PO 06/10/2569 UAT U93 · `13` §6.15)
 * ส่งต่อให้ `nextBusinessDay()` / `filingDueDateOf()` — แยกไฟล์จาก `holidays.ts` เพื่อตัดวง import
 * (`wht-policy.ts` และ `lib/wht/queries.ts` ต้องใช้ แต่ `holidays.ts` ก็เรียกตัวคิดกำหนดยื่นใหม่ของ `wht-policy.ts`)
 */
export async function loadHolidayKeys(
  client: Pick<typeof prisma, 'publicHoliday'>,
  organizationId: string,
): Promise<Set<string>> {
  const rows = await client.publicHoliday.findMany({
    where: { organizationId, deletedAt: null },
    select: { holidayDate: true },
  })
  return new Set(rows.map((row) => dateOnlyKey(row.holidayDate)))
}
