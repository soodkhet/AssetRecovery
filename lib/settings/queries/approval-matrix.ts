import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
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
  approvalFlow: true,
  enforceSegregationOfDuties: true,
  deletedAt: true,
  updatedAt: true,
} as const

type MatrixRow = Prisma.ApprovalMatrixGetPayload<{ select: typeof matrixSelect }>

function toDto(row: MatrixRow): ApprovalMatrixDto {
  return {
    id: row.id,
    condition: row.condition,
    conditionThresholdSatang: row.conditionThresholdSatang,
    approvalFlow: row.approvalFlow,
    enforceSegregationOfDuties: row.enforceSegregationOfDuties,
    isActive: row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

function toValues(dto: ApprovalMatrixDto): ApprovalMatrixValues {
  return {
    condition: dto.condition,
    conditionThresholdSatang: dto.conditionThresholdSatang,
    approvalFlow: dto.approvalFlow,
    enforceSegregationOfDuties: dto.enforceSegregationOfDuties,
  }
}

export async function listApprovalMatrices(
  organizationId: string,
  status: 'active' | 'inactive' | 'all' = 'active',
): Promise<ApprovalMatrixDto[]> {
  const rows = await prisma.approvalMatrix.findMany({
    where: { organizationId, ...statusFilter(status) },
    select: matrixSelect,
  })
  // เรียงตามเพดานเงินน้อย→มาก เพื่อให้อ่านลำดับการยกระดับอนุมัติได้จากบนลงล่าง (`13` §7)
  return sortApprovalMatrices(rows.map(toDto))
}

export async function getApprovalMatrix(organizationId: string, matrixId: string): Promise<ApprovalMatrixDto> {
  const row = await prisma.approvalMatrix.findFirst({ where: { id: matrixId, organizationId }, select: matrixSelect })
  if (!row) throw new SettingsError('APPROVAL_MATRIX_NOT_FOUND', { detail: `approval_matrix=${matrixId}` })
  return toDto(row)
}

function toWriteData(values: ApprovalMatrixValues) {
  const normalized = normalizeApprovalMatrixValues(values)
  return {
    condition: normalized.condition,
    conditionThresholdSatang: normalized.conditionThresholdSatang,
    approvalFlow: normalized.approvalFlow,
    enforceSegregationOfDuties: normalized.enforceSegregationOfDuties,
  }
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

  return toDto(created)
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

  return toDto(updated)
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

  return toDto(updated)
}
