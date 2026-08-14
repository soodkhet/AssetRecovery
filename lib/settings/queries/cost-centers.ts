import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { nextCostCenterCode } from '@/lib/settings/cost-center'
import { SettingsError } from '@/lib/settings/errors'
import { statusFilter, toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { CostCenterDto } from '@/lib/settings/types'

/**
 * ศูนย์ต้นทุน (`13` §6.6) — ชั้น DB
 *
 * `code` เป็น running number อัตโนมัติ (`CC-001`) — ผู้ใช้ส่งมาไม่ได้ · การชิงเลขพร้อมกันถูกกันด้วย
 * UNIQUE(organization_id, code) แล้ว **retry** ให้เอง (ไม่ปล่อย 500 ออกไปเพราะเลขชนกันชั่วคราว)
 */

const TARGET = 'cost_centers'
const CODE_RETRY_LIMIT = 5

const costCenterSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  isActive: true,
  deletedAt: true,
  updatedAt: true,
} as const

type CostCenterRow = Prisma.CostCenterGetPayload<{ select: typeof costCenterSelect }>

export interface CostCenterValues {
  name: string
  description: string | null
  isActive: boolean
}

function toDto(row: CostCenterRow): CostCenterDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    // ปิดใช้งานได้ 2 ทาง: ธง `is_active` (ตาราง) และ soft delete — ทั้งคู่ต้องแสดงว่าไม่ใช้งาน
    isActive: row.isActive && row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

function toAuditPayload(values: CostCenterValues, code: string): Record<string, unknown> {
  return { code, name: values.name.trim(), description: values.description, is_active: values.isActive }
}

export async function listCostCenters(
  organizationId: string,
  status: 'active' | 'inactive' | 'all' = 'active',
): Promise<CostCenterDto[]> {
  const rows = await prisma.costCenter.findMany({
    where: { organizationId, ...statusFilter(status) },
    select: costCenterSelect,
    orderBy: { code: 'asc' },
  })
  return rows.map(toDto)
}

export async function getCostCenter(organizationId: string, costCenterId: string): Promise<CostCenterDto> {
  const row = await prisma.costCenter.findFirst({
    where: { id: costCenterId, organizationId },
    select: costCenterSelect,
  })
  if (!row) throw new SettingsError('COST_CENTER_NOT_FOUND', { detail: `cost_center=${costCenterId}` })
  return toDto(row)
}

/** รหัสถัดไป — นับรวมแถวที่ถูก soft delete ด้วย เพื่อไม่ให้เลขซ้ำกับของเดิม */
async function reserveNextCode(organizationId: string): Promise<string> {
  const rows = await prisma.costCenter.findMany({ where: { organizationId }, select: { code: true } })
  return nextCostCenterCode(rows.map((row) => row.code))
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** จำนวนรายการค่าใช้จ่ายที่ผูกศูนย์ต้นทุนนี้ (ไฟล์ 32) */
export async function countCostCenterUsage(organizationId: string, costCenterId: string): Promise<number> {
  return prisma.expenseRecord.count({ where: { organizationId, costCenterId } })
}

export async function createCostCenter(
  context: SettingsMutationContext,
  values: CostCenterValues,
): Promise<CostCenterDto> {
  const organizationId = context.actor.organizationId

  for (let attempt = 1; attempt <= CODE_RETRY_LIMIT; attempt += 1) {
    const code = await reserveNextCode(organizationId)
    try {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.costCenter.create({
          data: {
            organizationId,
            code,
            name: values.name.trim(),
            description: values.description,
            isActive: values.isActive,
            createdBy: context.actor.id,
          },
          select: costCenterSelect,
        })

        await emitAudit(
          {
            organizationId,
            actorId: context.actor.id,
            actorRole: context.actor.roleName,
            action: 'create',
            targetType: TARGET,
            targetId: row.id,
            after: toAuditPayload(values, code),
            reason: context.reason,
            ipAddress: context.meta.ipAddress,
            userAgent: context.meta.userAgent,
          },
          tx,
        )

        return row
      })

      return toDto(created)
    } catch (error) {
      // เลขชนกับคำขอที่เข้ามาพร้อมกัน → คำนวณเลขใหม่แล้วลองอีกครั้ง
      if (isUniqueViolation(error) && attempt < CODE_RETRY_LIMIT) continue
      throw error
    }
  }

  throw new Error(`createCostCenter: จัดรหัสศูนย์ต้นทุนไม่สำเร็จหลังลอง ${CODE_RETRY_LIMIT} ครั้ง`)
}

export async function updateCostCenter(
  context: SettingsMutationContext,
  current: CostCenterDto,
  values: CostCenterValues,
): Promise<CostCenterDto> {
  const organizationId = context.actor.organizationId

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.costCenter.update({
      where: { id: current.id },
      // `code` ไม่อยู่ใน data — รหัสเปลี่ยนไม่ได้ตลอดอายุของศูนย์ต้นทุน (`13` §6.6)
      data: {
        name: values.name.trim(),
        description: values.description,
        isActive: values.isActive,
      },
      select: costCenterSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: toAuditPayload({ name: current.name, description: current.description, isActive: current.isActive }, current.code),
        after: toAuditPayload(values, current.code),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(updated)
}

/** ศูนย์ต้นทุนที่มีรายการค่าใช้จ่ายผูกอยู่ลบไม่ได้ → `COST_CENTER_IN_USE` (ปิดใช้งานแทน) */
export async function deleteCostCenter(
  context: SettingsMutationContext,
  current: CostCenterDto,
): Promise<CostCenterDto> {
  const organizationId = context.actor.organizationId
  const usage = await countCostCenterUsage(organizationId, current.id)
  if (usage > 0) {
    throw new SettingsError('COST_CENTER_IN_USE', {
      detail: `cost_center=${current.id} expense_records=${usage}`,
      context: { expenseRecords: usage },
    })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.costCenter.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), isActive: false },
      select: costCenterSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: row.id,
        before: toAuditPayload({ name: current.name, description: current.description, isActive: current.isActive }, current.code),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return toDto(updated)
}
