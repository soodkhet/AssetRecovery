import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { Prisma } from '@/lib/generated/prisma/client'
import type { ServiceFeeTemplateDto } from '@/lib/service-fee/types'

/**
 * mytester7 S7-AG2-05 — แก้เทมเพลตค่าบริการ = สร้างเวอร์ชันใหม่ **ไม่ทับของเดิม** (`12` §9 · `92` §7.1)
 * เปลี่ยนชื่อในเวอร์ชันใหม่ต้องไม่เปลี่ยนชื่อของ v1 (เคสที่ snapshot v1 ต้องเห็นชื่อ v1 ให้ตรงยอด)
 * ประวัติจับกลุ่มด้วย `lineage_id` แทนชื่อ
 */

const txMock = vi.hoisted(() => ({
  serviceFeeTemplate: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  financeCompany: { updateMany: vi.fn() },
}))

const prismaMock = vi.hoisted(() => ({
  serviceFeeTemplate: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  financeCompany: { findMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/audit/audit', () => ({ emitAudit: vi.fn() }))

const { updateServiceFeeTemplate, listServiceFeeTemplateVersions, setServiceFeeTemplateActive } = await import(
  '@/lib/service-fee/queries'
)

const actor = {
  id: 'actor-1',
  organizationId: 'org-1',
  roleName: 'Superadmin',
} as SessionUser

const ctx = { actor, meta: { ipAddress: null, userAgent: null }, reason: 'ปรับราคาตามสัญญาใหม่' }

const V1: ServiceFeeTemplateDto = {
  id: 'tpl-v1',
  name: 'เหมาจ่าย 1,250 บาท/เคส',
  model: 'FLAT',
  baseSatang: 125000,
  ratePct: 0,
  basis: null,
  failFeeSatang: null,
  version: 1,
  isCurrent: true,
  isActive: true,
  updatedAt: '2026-10-18T00:00:00.000Z',
}

function createdRow(data: Record<string, unknown>) {
  return {
    id: 'tpl-v2',
    name: data.name,
    model: data.model,
    baseSatang: data.baseSatang,
    ratePct: new Prisma.Decimal(0),
    basis: null,
    failFeeSatang: null,
    version: data.version,
    isCurrent: true,
    deletedAt: null,
    updatedAt: new Date('2026-10-19T00:00:00Z'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.$transaction.mockImplementation(async (run: (tx: typeof txMock) => Promise<unknown>) => run(txMock))
  txMock.serviceFeeTemplate.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    createdRow(data),
  )
})

describe('updateServiceFeeTemplate — เปลี่ยนชื่อไม่ทับเวอร์ชันเดิม', () => {
  it('เปลี่ยนชื่อ + ยอด ⇒ ไม่ updateMany ชื่อของเวอร์ชันเดิม · เวอร์ชันใหม่อยู่สายของ v1', async () => {
    prismaMock.serviceFeeTemplate.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id === V1.id ? { id: V1.id, lineageId: null } : null,
    )

    const updated = await updateServiceFeeTemplate(ctx, V1, {
      name: 'เหมาจ่าย 1,390 บาท/เคส',
      model: 'FLAT',
      baseSatang: 139000,
      ratePct: 0,
      basis: null,
      failFeeSatang: null,
    })

    expect(txMock.serviceFeeTemplate.updateMany).not.toHaveBeenCalled()
    expect(txMock.serviceFeeTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: V1.id }, data: expect.not.objectContaining({ name: expect.anything() }) }),
    )
    expect(txMock.serviceFeeTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'เหมาจ่าย 1,390 บาท/เคส', version: 2, lineageId: V1.id }),
      }),
    )
    expect(updated.name).toBe('เหมาจ่าย 1,390 บาท/เคส')
  })

  it('ตรวจชื่อซ้ำเฉพาะเทมเพลตสายอื่น (ไม่นับสายตัวเอง)', async () => {
    prismaMock.serviceFeeTemplate.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) =>
      where.id === V1.id ? { id: V1.id, lineageId: null } : null,
    )
    await updateServiceFeeTemplate(ctx, V1, { ...V1, name: 'ชื่อใหม่' })
    expect(prismaMock.serviceFeeTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', name: 'ชื่อใหม่', NOT: { id: V1.id }, OR: [{ lineageId: null }, { lineageId: { not: V1.id } }] },
      }),
    )
  })
})

describe('ประวัติ/ปิดใช้งาน จับกลุ่มด้วยสายเวอร์ชัน ไม่ใช่ชื่อ', () => {
  it('ประวัติเวอร์ชันของ v2 (lineage = v1) ⇒ ค้นทั้งสาย', async () => {
    prismaMock.serviceFeeTemplate.findFirst.mockResolvedValue({ id: 'tpl-v2', lineageId: V1.id })
    prismaMock.serviceFeeTemplate.findMany.mockResolvedValue([])
    await listServiceFeeTemplateVersions('org-1', 'tpl-v2')
    expect(prismaMock.serviceFeeTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', OR: [{ id: V1.id }, { lineageId: V1.id }] } }),
    )
  })

  it('ปิดใช้งาน ⇒ ปิดทุกเวอร์ชันในสาย (ชื่อต่างกันได้)', async () => {
    prismaMock.serviceFeeTemplate.findFirst.mockResolvedValue({ id: 'tpl-v2', lineageId: V1.id })
    prismaMock.financeCompany.findMany.mockResolvedValue([])
    prismaMock.$transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ serviceFeeTemplate: { updateMany: prismaMock.serviceFeeTemplate.updateMany } }),
    )
    await setServiceFeeTemplateActive(ctx, { ...V1, id: 'tpl-v2', version: 2 }, false)
    expect(prismaMock.serviceFeeTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', OR: [{ id: V1.id }, { lineageId: V1.id }] } }),
    )
  })
})
