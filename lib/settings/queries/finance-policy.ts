import { emitAudit } from '@/lib/audit/audit'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_AR_AGING_BUCKETS,
  DEFAULT_WRITE_OFF_TOLERANCE_SATANG,
  describeAgingBuckets,
  normalizeFinancePolicyValues,
  toFinancePolicyAuditPayload,
  type FinancePolicyValues,
} from '@/lib/settings/finance-policy'
import { toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { FinancePolicyDto } from '@/lib/settings/types'

/**
 * ค่านโยบายการเงินระดับองค์กร (`13` §6.2.1 · DEC-006/D1) — **1 record ต่อองค์กร**
 *
 * ไม่มี create/delete: `GET` สร้างแถวให้เองด้วยค่าเริ่มต้นถ้ายังไม่มี (seed ปกติสร้างไว้แล้ว)
 * — การ "อ่านแล้วสร้าง" ไม่ถือเป็น mutation เชิงธุรกิจจึงไม่ลง audit (ค่าเท่ากับ default ทุกช่อง)
 */

const TARGET = 'finance_policy_settings'

const policySelect = {
  advanceMaxAmountPerRequestSatang: true,
  requirePayeeIdDocument: true,
  arAgingBuckets: true,
  writeOffToleranceSatang: true,
  advanceUnclearedToEmployeeReceivable: true,
  updatedAt: true,
} as const

interface PolicyRow {
  advanceMaxAmountPerRequestSatang: number | null
  requirePayeeIdDocument: boolean
  arAgingBuckets: number[]
  writeOffToleranceSatang: number
  advanceUnclearedToEmployeeReceivable: boolean
  updatedAt: Date
}

function toDto(row: PolicyRow): FinancePolicyDto {
  return {
    advanceMaxAmountPerRequestSatang: row.advanceMaxAmountPerRequestSatang,
    requirePayeeIdDocument: row.requirePayeeIdDocument,
    arAgingBuckets: row.arAgingBuckets,
    arAgingLabels: describeAgingBuckets(row.arAgingBuckets),
    writeOffToleranceSatang: row.writeOffToleranceSatang,
    advanceUnclearedToEmployeeReceivable: row.advanceUnclearedToEmployeeReceivable,
    updatedAt: toIso(row.updatedAt),
  }
}

function toValues(dto: FinancePolicyDto): FinancePolicyValues {
  return {
    advanceMaxAmountPerRequestSatang: dto.advanceMaxAmountPerRequestSatang,
    requirePayeeIdDocument: dto.requirePayeeIdDocument,
    arAgingBuckets: dto.arAgingBuckets,
    writeOffToleranceSatang: dto.writeOffToleranceSatang,
    advanceUnclearedToEmployeeReceivable: dto.advanceUnclearedToEmployeeReceivable,
  }
}

export async function getFinancePolicy(organizationId: string): Promise<FinancePolicyDto> {
  const existing = await prisma.financePolicySettings.findUnique({
    where: { organizationId },
    select: policySelect,
  })
  if (existing) return toDto(existing)

  const created = await prisma.financePolicySettings.create({
    data: {
      organizationId,
      arAgingBuckets: [...DEFAULT_AR_AGING_BUCKETS],
      writeOffToleranceSatang: DEFAULT_WRITE_OFF_TOLERANCE_SATANG,
    },
    select: policySelect,
  })
  return toDto(created)
}

export async function updateFinancePolicy(
  context: SettingsMutationContext,
  current: FinancePolicyDto,
  values: FinancePolicyValues,
): Promise<FinancePolicyDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeFinancePolicyValues(values)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.financePolicySettings.update({
      where: { organizationId },
      data: {
        advanceMaxAmountPerRequestSatang: normalized.advanceMaxAmountPerRequestSatang,
        requirePayeeIdDocument: normalized.requirePayeeIdDocument,
        arAgingBuckets: normalized.arAgingBuckets,
        writeOffToleranceSatang: normalized.writeOffToleranceSatang,
        advanceUnclearedToEmployeeReceivable: normalized.advanceUnclearedToEmployeeReceivable,
        updatedBy: context.actor.id,
      },
      select: policySelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        // PK ของตารางนี้คือ organization_id เอง (`02` §5)
        targetId: organizationId,
        before: toFinancePolicyAuditPayload(normalizeFinancePolicyValues(toValues(current))),
        after: toFinancePolicyAuditPayload(normalized),
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
