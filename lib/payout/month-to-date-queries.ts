import { periodKeyOf, periodRangeOf } from '@/lib/accounting/period'
import { monthToDateByPayee, type MonthToDate } from '@/lib/finance/wht-month-to-date'
import { prisma } from '@/lib/prisma'

/**
 * staging E-054 — ยอดสะสมของผู้รับในรอบจ่ายก่อน ๆ ของเดือนปฏิทินไทยเดียวกับ `at` (รอบที่ไม่ถูกยกเลิก ·
 * รายการค่าตอบแทนในฐาน WHT หมวดที่มีเกณฑ์) — รวมยอดด้วย `monthToDateByPayee()` (pure)
 * ใช้ร่วม: สร้างรอบจ่าย · คิวอนุมัติ (ยอดคาดการณ์ — mytester F-03) · ไฟล์ค้างจ่าย 15 (mytester H-04)
 */
export async function loadMonthToDate(
  organizationId: string,
  payeeIds: readonly string[],
  at: Date,
): Promise<Map<string, MonthToDate>> {
  if (payeeIds.length === 0) return new Map()
  const { start, end } = periodRangeOf(periodKeyOf(at))
  const rows = await prisma.payoutBatchItem.findMany({
    where: {
      organizationId,
      payeeId: { in: [...new Set(payeeIds)] },
      expenseId: { not: null },
      whtBaseIncluded: true,
      OR: [{ whtIncomeCategory: 'sec_40_8' }, { whtIncomeCategory: null }],
      payoutBatch: { status: { not: 'cancelled' }, createdAt: { gte: start, lt: end } },
    },
    select: { payeeId: true, grossSatang: true, whtSatang: true, whtCarriedBaseSatang: true, whtCondition: true },
  })
  return monthToDateByPayee(rows)
}
