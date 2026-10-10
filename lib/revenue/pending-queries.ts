import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'
import {
  revenuePendingReasonOf,
  revenuePendingReasonText,
  type RevenuePendingItemDto,
} from '@/lib/revenue/pending'
import {
  evaluateCaseRevenueGates,
  expenseGateOf,
  loadUnsettledFieldRounds,
  lotGateOf,
  roundKey,
} from '@/lib/warehouse/revenue-service'

/**
 * `GET /api/finance/revenue-pending` (staging E-008) — เคสที่ปิดงานแล้วแต่รายได้ของรอบติดตามปัจจุบันยังไม่เกิด
 * พร้อมเหตุผลว่าติดเงื่อนไขไหน — **อ่านอย่างเดียว** ไม่สร้างรายได้ ไม่ลง audit
 *
 * เกตตัดสินด้วย `evaluateCaseRevenueGates()` ตัวเดียวกับ `tryCreateRevenue()` (`19` §6.1) — ห้ามเขียนเงื่อนไขซ้ำ
 * ที่นี่แค่โหลดข้อมูลแบบเดียวกัน (ไม่ล็อกแถว เพราะไม่เขียน) · รอบก่อนรีไซเคิลไม่อยู่ในรายการนี้
 *
 * เฉพาะคนในองค์กร (scope `global`) — ผู้ใช้ฝั่งบริษัทไฟแนนซ์ได้รายการว่าง (ข้อมูลปฏิบัติการภายใน)
 */

const PENDING_LIMIT = 300

export async function listRevenuePendingCases(user: SessionUser): Promise<RevenuePendingItemDto[]> {
  if (user.scope.kind !== 'global') return []
  const organizationId = user.organizationId

  const cases = await prisma.case.findMany({
    where: {
      organizationId,
      deletedAt: null,
      outcome: { not: null },
      status: { in: ['closed_success', 'closed_fail'] },
    },
    orderBy: [{ closedAt: 'desc' }, { id: 'asc' }],
    take: PENDING_LIMIT * 2,
    select: {
      id: true,
      caseRef: true,
      trackingRound: true,
      outcome: true,
      closedAt: true,
      debtorName: true,
      serviceFeeModelSnapshot: true,
      serviceFeeFailFeeSatang: true,
      company: { select: { name: true } },
    },
  })
  if (cases.length === 0) return []
  const caseIds = cases.map((row) => row.id)

  const [expenses, assets, revenues, unsettledRounds] = await Promise.all([
    prisma.expense.findMany({
      where: { organizationId, caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, status: true, assignment: { select: { trackingRound: true } } },
    }),
    prisma.asset.findMany({
      where: { organizationId, caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, lot: { select: { status: true } } },
    }),
    prisma.revenue.findMany({
      where: { organizationId, caseId: { in: caseIds }, deletedAt: null },
      select: { caseId: true, trackingRound: true },
    }),
    loadUnsettledFieldRounds(prisma, organizationId, caseIds),
  ])

  const revenueRounds = new Set(revenues.map((row) => roundKey(row.caseId, row.trackingRound)))
  const currentRoundOf = new Map(cases.map((row) => [row.id, row.trackingRound]))
  const expenseStatusesByRound = new Map<string, (typeof expenses)[number]['status'][]>()
  for (const expense of expenses) {
    if (expense.caseId === null) continue
    const round = expense.assignment?.trackingRound ?? currentRoundOf.get(expense.caseId) ?? 1
    const key = roundKey(expense.caseId, round)
    expenseStatusesByRound.set(key, [...(expenseStatusesByRound.get(key) ?? []), expense.status])
  }
  const lotStatusesByCase = new Map<string, (string | null)[]>()
  for (const asset of assets) {
    if (asset.caseId === null) continue
    lotStatusesByCase.set(asset.caseId, [...(lotStatusesByCase.get(asset.caseId) ?? []), asset.lot?.status ?? null])
  }

  const items: RevenuePendingItemDto[] = []
  for (const row of cases) {
    if (row.outcome === null) continue
    const key = roundKey(row.id, row.trackingRound)
    const gates = evaluateCaseRevenueGates([
      {
        caseId: row.id,
        model: row.serviceFeeModelSnapshot,
        failFeeSatang: row.serviceFeeFailFeeSatang,
        outcome: row.outcome,
        ...expenseGateOf(expenseStatusesByRound.get(key) ?? []),
        lotState: lotGateOf(lotStatusesByCase.get(row.id) ?? []),
        fieldDaysSettled: !unsettledRounds.has(key),
        hasRevenue: revenueRounds.has(key),
      },
    ])
    const reason = revenuePendingReasonOf(gates.skipped[0]?.reason ?? null)
    if (reason === null) continue
    items.push({
      caseId: row.id,
      caseRef: row.caseRef,
      trackingRound: row.trackingRound,
      companyName: row.company.name,
      debtorName: row.debtorName,
      outcome: row.outcome,
      closedAt: row.closedAt?.toISOString() ?? null,
      reason,
      reasonText: revenuePendingReasonText(reason),
    })
    if (items.length >= PENDING_LIMIT) break
  }
  return items
}
