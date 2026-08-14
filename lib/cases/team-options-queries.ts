import type { SessionUser } from '@/lib/auth/types'
import type { CaseTeamOptionDto, CaseTeamOptionsDto } from '@/lib/cases/types'
import { prisma } from '@/lib/prisma'

/**
 * ตัวเลือกทีมสำหรับกล่อง "ทีมที่เสนอ" ของฟอร์มรับเคสและ Review Modal (`38` §7.4) — ชั้น DB
 *
 * ทำไมไม่เรียก `GET /api/teams` ซ้ำ: หน้าจอต้องการ **ค่าตั้งของแผนค่าตอบแทนต่อทีม** ด้วย และผู้ใช้
 * ที่ต้องเห็นกล่องนี้ (เจ้าหน้าที่อนุมัติเคส) ไม่มี `view_master_data`/`manage_compensation_plans`
 * (`25` §7.1) ⇒ endpoint นี้อ่านด้วย capability ชุดเดียวกับการอ่านเคส (`CASE_READ_CAPABILITIES`)
 *
 * ⚠️ คืน **ค่าที่ตั้งไว้** อย่างเดียว ไม่คำนวณอะไรทั้งสิ้น (`38` §7.4 ห้ามสรุปกำไร/ขาดทุน)
 * และไม่ผูกกับ scope ของทีมผู้เรียก เพราะผู้พิจารณาต้องเลือกทีมข้ามพื้นที่ได้ (§7.4 "ดูทีมอื่นทั้งหมด")
 */
export async function listCaseTeamOptions(user: SessionUser): Promise<CaseTeamOptionsDto> {
  const rows = await prisma.team.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, status: 'active' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      side: true,
      provinces: true,
      supervisor: { select: { fullName: true } },
      compensationPlan: {
        select: {
          id: true,
          name: true,
          version: true,
          fuelMode: true,
          fuelRatePerKmSatang: true,
          fuelMaxPerCaseSatang: true,
          fuelDailyFlatSatang: true,
          allowanceSatang: true,
          hotelMaxPerNightSatang: true,
          commissionSatang: true,
          noSuccessFeeSatang: true,
        },
      },
    },
  })

  const teams: CaseTeamOptionDto[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    side: row.side,
    provinces: row.provinces,
    supervisorName: row.supervisor?.fullName ?? null,
    cost:
      row.compensationPlan === null
        ? null
        : {
            planId: row.compensationPlan.id,
            planName: row.compensationPlan.name,
            planVersion: row.compensationPlan.version,
            fuelMode: row.compensationPlan.fuelMode,
            fuelRatePerKmSatang: row.compensationPlan.fuelRatePerKmSatang,
            fuelMaxPerCaseSatang: row.compensationPlan.fuelMaxPerCaseSatang,
            fuelDailyFlatSatang: row.compensationPlan.fuelDailyFlatSatang,
            allowanceSatang: row.compensationPlan.allowanceSatang,
            hotelMaxPerNightSatang: row.compensationPlan.hotelMaxPerNightSatang,
            commissionSatang: row.compensationPlan.commissionSatang,
            noSuccessFeeSatang: row.compensationPlan.noSuccessFeeSatang,
          },
  }))

  return { teams }
}
