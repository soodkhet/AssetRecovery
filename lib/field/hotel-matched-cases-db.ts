import { matchHotelStays, stayDateKeys, type HotelStay, type MatchedCase } from '@/lib/field/hotel-matched-cases'
import { prisma } from '@/lib/prisma'

/**
 * โหลดเคสที่จับคู่อัตโนมัติของใบเบิกค่าที่พักหลายใบในคำขอเดียว (mytester DO-08) — scope ตามแถวที่ผู้เรียกกรองสิทธิ์มาแล้ว
 * (assignment ของพนักงานผู้เบิกในองค์กรเดียวกันเท่านั้น) · ใช้ตรวจสอบเท่านั้น ไม่มีผลต่อยอดเงิน
 */
export async function loadHotelMatchedCases(
  organizationId: string,
  stays: readonly HotelStay[],
): Promise<Map<string, MatchedCase[]>> {
  if (stays.length === 0) return new Map()
  const agentIds = [...new Set(stays.map((stay) => stay.agentUserId))]
  const dates = [...new Set(stays.flatMap(stayDateKeys))]
  const rows = await prisma.caseAssignment.findMany({
    where: {
      organizationId,
      agentId: { in: agentIds },
      scheduledDate: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) },
      // รีวิวเฟส 4 ข้อ 5 — งานที่ถูกโอนไปคนอื่นแล้ว (`reassigned_away` — รวมกรณีไม่ยินยอมแล้วถูกโอน) ไม่ใช่งานของผู้เบิก
      // · เคสที่ถูกลบไม่ใช่หลักฐานการเข้าพัก
      status: { not: 'reassigned_away' },
      case: { deletedAt: null },
    },
    select: { agentId: true, caseId: true, scheduledDate: true, case: { select: { caseRef: true } } },
  })
  return matchHotelStays(
    stays,
    rows.flatMap((row) =>
      row.scheduledDate === null
        ? []
        : [
            {
              agentId: row.agentId,
              caseId: row.caseId,
              caseRef: row.case.caseRef,
              scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
            },
          ],
    ),
  )
}
