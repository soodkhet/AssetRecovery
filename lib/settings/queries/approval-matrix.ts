import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  approvalFlowRoleNames,
  invalidApprovalSteps,
  normalizeApprovalMatrixValues,
  sortApprovalMatrices,
  toApprovalMatrixAuditPayload,
  type ApprovalMatrixValues,
} from '@/lib/settings/approval-matrix'
import { SettingsError } from '@/lib/settings/errors'
import { statusFilter, toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { ApprovalMatrixDto } from '@/lib/settings/types'

/**
 * สายการอนุมัติ (`13` §6.2) — ชั้น DB
 *
 * `approval_matrices` อยู่หมวด **สิทธิ์** (`lib/audit/reason-policy.ts`) ⇒ `reason` บังคับทุก mutation
 * · ตัวจับคู่สายกับรายการเบิกอยู่ไฟล์ 16 (Phase 3.2/3.3) ไม่ใช่ที่นี่
 */

const TARGET = 'approval_matrices'

const matrixSelect = {
  id: true,
  condition: true,
  conditionThresholdSatang: true,
  approvalFlowRoleIds: true,
  enforceSegregationOfDuties: true,
  deletedAt: true,
  updatedAt: true,
} as const

type MatrixRow = Prisma.ApprovalMatrixGetPayload<{ select: typeof matrixSelect }>

/**
 * role id → ชื่อปัจจุบัน ของทุก role ในองค์กร (รวมที่ลบแล้ว — สายเก่าที่อ้างอยู่ยังแสดงชื่อได้)
 * ใช้ร่วมกับตัวอนุมัติ/คิวแจ้งเตือน (มติ PO U149) — ชื่ออ่านสดทุกครั้ง ⇒ เปลี่ยนชื่อ role แล้วสายยังชี้ role เดิม
 */
export async function loadRoleNameMap(
  organizationId: string,
  db: Pick<typeof prisma, 'role'> = prisma,
): Promise<Map<string, string>> {
  const roles = await db.role.findMany({ where: { organizationId }, select: { id: true, name: true } })
  return new Map(roles.map((role) => [role.id, role.name]))
}

function toDto(row: MatrixRow, roleNames: ReadonlyMap<string, string>): ApprovalMatrixDto {
  return {
    id: row.id,
    condition: row.condition,
    conditionThresholdSatang: row.conditionThresholdSatang,
    approvalFlowRoleIds: row.approvalFlowRoleIds,
    approvalFlow: approvalFlowRoleNames(row.approvalFlowRoleIds, roleNames),
    enforceSegregationOfDuties: row.enforceSegregationOfDuties,
    isActive: row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

function toValues(dto: ApprovalMatrixDto): ApprovalMatrixValues {
  return {
    condition: dto.condition,
    conditionThresholdSatang: dto.conditionThresholdSatang,
    approvalFlowRoleIds: dto.approvalFlowRoleIds,
    enforceSegregationOfDuties: dto.enforceSegregationOfDuties,
  }
}

export async function listApprovalMatrices(
  organizationId: string,
  status: 'active' | 'inactive' | 'all' = 'active',
): Promise<ApprovalMatrixDto[]> {
  const [rows, roleNames] = await Promise.all([
    prisma.approvalMatrix.findMany({ where: { organizationId, ...statusFilter(status) }, select: matrixSelect }),
    loadRoleNameMap(organizationId),
  ])
  // เรียงตามเพดานเงินน้อย→มาก เพื่อให้อ่านลำดับการยกระดับอนุมัติได้จากบนลงล่าง (`13` §7)
  return sortApprovalMatrices(rows.map((row) => toDto(row, roleNames)))
}

export async function getApprovalMatrix(organizationId: string, matrixId: string): Promise<ApprovalMatrixDto> {
  const row = await prisma.approvalMatrix.findFirst({ where: { id: matrixId, organizationId }, select: matrixSelect })
  if (!row) throw new SettingsError('APPROVAL_MATRIX_NOT_FOUND', { detail: `approval_matrix=${matrixId}` })
  return toDto(row, await loadRoleNameMap(organizationId))
}

function toWriteData(values: ApprovalMatrixValues) {
  const normalized = normalizeApprovalMatrixValues(values)
  return {
    condition: normalized.condition,
    conditionThresholdSatang: normalized.conditionThresholdSatang,
    approvalFlowRoleIds: normalized.approvalFlowRoleIds,
    enforceSegregationOfDuties: normalized.enforceSegregationOfDuties,
  }
}

/**
 * ขั้นในสายที่ไม่ใช่ role ผู้อนุมัติที่เลือกได้ในองค์กร (UAT BUG-008 · มติ PO U149) — คืน role id · ว่าง = ผ่าน
 * route ใช้ตัวนี้ตอบ 400 + field error ที่ช่อง `approvalFlowRoleIds` ก่อนเขียน
 */
export async function findInvalidApprovalSteps(organizationId: string, roleIds: readonly string[]): Promise<string[]> {
  const roles = await prisma.role.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true, roleGroup: true, isSeed: true },
  })
  return invalidApprovalSteps(roleIds, roles)
}

/** ข้อความ field error ของช่องลำดับขั้นอนุมัติ */
export function invalidApprovalStepsMessage(invalid: readonly string[]): string {
  return `มีขั้นอนุมัติ ${invalid.length} ขั้นที่ไม่ใช่บทบาทผู้อนุมัติในระบบ — เลือกจากรายการใหม่`
}

export async function createApprovalMatrix(
  context: SettingsMutationContext,
  values: ApprovalMatrixValues,
): Promise<ApprovalMatrixDto> {
  const organizationId = context.actor.organizationId

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.approvalMatrix.create({
      data: { organizationId, ...toWriteData(values), createdBy: context.actor.id },
      select: matrixSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: toApprovalMatrixAuditPayload(normalizeApprovalMatrixValues(values)),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(created, await loadRoleNameMap(organizationId))
}

export async function updateApprovalMatrix(
  context: SettingsMutationContext,
  current: ApprovalMatrixDto,
  values: ApprovalMatrixValues,
): Promise<ApprovalMatrixDto> {
  const organizationId = context.actor.organizationId

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.approvalMatrix.update({
      where: { id: current.id },
      data: { ...toWriteData(values), updatedBy: context.actor.id },
      select: matrixSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: toApprovalMatrixAuditPayload(toValues(current)),
        after: toApprovalMatrixAuditPayload(normalizeApprovalMatrixValues(values)),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(updated, await loadRoleNameMap(organizationId))
}

export async function deleteApprovalMatrix(
  context: SettingsMutationContext,
  current: ApprovalMatrixDto,
): Promise<ApprovalMatrixDto> {
  const organizationId = context.actor.organizationId

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.approvalMatrix.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), updatedBy: context.actor.id },
      select: matrixSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: row.id,
        before: toApprovalMatrixAuditPayload(toValues(current)),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return toDto(updated, await loadRoleNameMap(organizationId))
}
