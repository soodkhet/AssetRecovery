import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { CompensationPlanValues } from '@/lib/compensation/plan'
import type { CompensationPlanDto } from '@/lib/compensation/types'

/**
 * mytester7 FX2 — แก้แผนค่าตอบแทน = สร้างเวอร์ชันใหม่ **ไม่ทับของเดิม** (`11` §10 · `92` §7.1)
 * เปลี่ยนชื่อในเวอร์ชันใหม่ต้องไม่เปลี่ยนชื่อของ v1 (รายการเบิกที่ snapshot v1 ต้องเห็นชื่อ v1 ให้ตรงยอด)
 * ประวัติ/ทีมที่ผูก/เปิด-ปิด จับกลุ่มด้วย `lineage_id` แทนชื่อ
 */

const txMock = vi.hoisted(() => ({
  compensationPlan: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(async () => null) },
  team: { updateMany: vi.fn() },
  $executeRaw: vi.fn(async () => 1),
}))

const prismaMock = vi.hoisted(() => ({
  compensationPlan: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  team: { count: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/audit/audit', () => ({ emitAudit: vi.fn() }))

const { updateCompensationPlan, listCompensationPlanVersions, setCompensationPlanActive } = await import(
  '@/lib/compensation/queries'
)

const actor = {
  id: 'actor-1',
  organizationId: 'org-1',
  roleName: 'Superadmin',
} as SessionUser

const ctx = { actor, meta: { ipAddress: null, userAgent: null }, reason: 'ปรับอัตราตามรอบใหม่' }

const V1: CompensationPlanDto = {
  id: 'plan-v1',
  name: 'แผนภาคสนาม 2569',
  side: 'inhouse',
  fuelMode: 'DAILY_FLAT',
  fuelRatePerKmSatang: null,
  fuelMaxPerCaseSatang: null,
  fuelDailyFlatSatang: 30000,
  allowanceSatang: 20000,
  commissionSatang: 150000,
  noSuccessFeeSatang: 50000,
  hotelMaxPerNightSatang: null,
  hotelReceiptRequired: false,
  whtPct: 3,
  effectiveFrom: '2026-01-01',
  version: 1,
  effectiveTo: null,
  isCurrent: true,
  isActive: true,
  updatedAt: '2026-10-18T00:00:00.000Z',
}

const LINEAGE_OF_V1 = { OR: [{ id: V1.id }, { lineageId: V1.id }] }

function valuesOf(plan: CompensationPlanDto): CompensationPlanValues {
  const { id: _id, version: _v, effectiveTo: _to, isCurrent: _c, isActive: _a, updatedAt: _u, ...values } = plan
  return values
}

function createdRow(data: Record<string, unknown>) {
  return {
    ...data,
    id: 'plan-v2',
    whtPct: new Prisma.Decimal(3),
    effectiveTo: null,
    isCurrent: true,
    deletedAt: null,
    updatedAt: new Date('2026-10-19T00:00:00Z'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.$transaction.mockImplementation(async (run: (tx: typeof txMock) => Promise<unknown>) => run(txMock))
  txMock.compensationPlan.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    createdRow(data),
  )
  prismaMock.compensationPlan.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) =>
    where.id === V1.id ? { id: V1.id, lineageId: null } : null,
  )
})

describe('updateCompensationPlan — เปลี่ยนชื่อไม่ทับเวอร์ชันเดิม', () => {
  it('เปลี่ยนชื่อ + ยอด ⇒ ไม่ updateMany ชื่อของเวอร์ชันเดิม · เวอร์ชันใหม่อยู่สายของ v1', async () => {
    const updated = await updateCompensationPlan(ctx, V1, {
      ...valuesOf(V1),
      name: 'แผนภาคสนาม 2570',
      commissionSatang: 180000,
    })

    expect(txMock.compensationPlan.updateMany).not.toHaveBeenCalled()
    expect(txMock.compensationPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: V1.id }, data: expect.not.objectContaining({ name: expect.anything() }) }),
    )
    expect(txMock.compensationPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'แผนภาคสนาม 2570', version: 2, lineageId: V1.id }),
      }),
    )
    expect(updated.name).toBe('แผนภาคสนาม 2570')
  })

  it('แก้เวอร์ชันที่อยู่กลางสาย (v2 → v3) ⇒ เวอร์ชันใหม่ยังชี้ id ของเวอร์ชันแรก', async () => {
    const V2: CompensationPlanDto = { ...V1, id: 'plan-v2', version: 2, name: 'แผนภาคสนาม 2570' }
    prismaMock.compensationPlan.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id === V2.id ? { id: V2.id, lineageId: V1.id } : null,
    )
    await updateCompensationPlan(ctx, V2, { ...valuesOf(V2), allowanceSatang: 25000 })
    expect(txMock.compensationPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 3, lineageId: V1.id }) }),
    )
  })

  it('ตรวจชื่อซ้ำเฉพาะแผนสายอื่น (ไม่นับสายตัวเอง)', async () => {
    await updateCompensationPlan(ctx, V1, { ...valuesOf(V1), name: 'ชื่อใหม่' })
    expect(prismaMock.compensationPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', name: 'ชื่อใหม่', NOT: { id: V1.id }, OR: [{ lineageId: null }, { lineageId: { not: V1.id } }] } }),
    )
    // FX review L1 — ตรวจซ้ำในทรานแซกชันใต้ล็อกชื่อระดับองค์กรก่อน insert
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1)
    expect(txMock.$executeRaw.mock.calls[0]?.slice(1)).toEqual(['compensation_plans:name:org-1'])
    expect(txMock.compensationPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ name: 'ชื่อใหม่', NOT: { id: V1.id } }) }),
    )
  })
})

describe('ประวัติ/ทีมที่ผูก/ปิดใช้งาน จับกลุ่มด้วยสายเวอร์ชัน ไม่ใช่ชื่อ', () => {
  it('ประวัติเวอร์ชันของ v2 (lineage = v1) ⇒ ค้นทั้งสาย', async () => {
    prismaMock.compensationPlan.findFirst.mockResolvedValue({ id: 'plan-v2', lineageId: V1.id })
    prismaMock.compensationPlan.findMany.mockResolvedValue([])
    await listCompensationPlanVersions('org-1', 'plan-v2')
    expect(prismaMock.compensationPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', ...LINEAGE_OF_V1 } }),
    )
  })

  it('ปิดใช้งาน ⇒ นับทีมที่ผูกทั้งสาย แล้วปิดทุกเวอร์ชันในสาย (ชื่อต่างกันได้)', async () => {
    prismaMock.compensationPlan.findFirst.mockResolvedValue({ id: 'plan-v2', lineageId: V1.id })
    prismaMock.team.count.mockResolvedValue(0)
    prismaMock.$transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ compensationPlan: { updateMany: prismaMock.compensationPlan.updateMany } }),
    )
    await setCompensationPlanActive(ctx, { ...V1, id: 'plan-v2', version: 2 }, false)
    expect(prismaMock.team.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', deletedAt: null, compensationPlan: { organizationId: 'org-1', ...LINEAGE_OF_V1 } },
      }),
    )
    expect(prismaMock.compensationPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', ...LINEAGE_OF_V1 } }),
    )
  })

  it('ปิดใช้งานแผนที่ยังมีทีมผูก (ทีมชี้เวอร์ชันไหนในสายก็ตาม) ⇒ PLAN_IN_USE', async () => {
    prismaMock.team.count.mockResolvedValue(2)
    await expect(setCompensationPlanActive(ctx, V1, false)).rejects.toMatchObject({ code: 'PLAN_IN_USE' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
