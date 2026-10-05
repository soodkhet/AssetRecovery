import { emitAudit } from '@/lib/audit/audit'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS,
  toDataRetentionAuditPayload,
  type DataRetentionValues,
} from '@/lib/settings/data-retention'
import { toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { DataRetentionPolicyDto } from '@/lib/settings/types'

/**
 * ระยะเก็บเอกสารลูกหนี้ (PDPA — มติ PO 06/10/2569 U97 · `13` §6.16) — **1 record ต่อองค์กร**
 *
 * ⚠️ **GET ต้องไม่เขียน DB** (แนวเดียวกับ `queries/sla-policy.ts`): ยังไม่มีแถว = คืนค่าเริ่มต้น 5 ปีเฉย ๆ
 * แถวเกิดตอน PATCH ครั้งแรก (upsert + audit + เหตุผล)
 */

const TARGET = 'data_retention_settings'

export async function getDataRetentionPolicy(organizationId: string): Promise<DataRetentionPolicyDto> {
  const row = await prisma.dataRetentionSettings.findUnique({
    where: { organizationId },
    select: { debtorDocumentRetentionYears: true, updatedAt: true },
  })
  if (row === null) {
    return { debtorDocumentRetentionYears: DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS, updatedAt: null }
  }
  return { debtorDocumentRetentionYears: row.debtorDocumentRetentionYears, updatedAt: toIso(row.updatedAt) }
}

export async function updateDataRetentionPolicy(
  context: SettingsMutationContext,
  current: DataRetentionPolicyDto,
  values: DataRetentionValues,
): Promise<DataRetentionPolicyDto> {
  const organizationId = context.actor.organizationId
  const isFirstTime = current.updatedAt === null

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.dataRetentionSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        debtorDocumentRetentionYears: values.debtorDocumentRetentionYears,
        updatedBy: context.actor.id,
      },
      update: { debtorDocumentRetentionYears: values.debtorDocumentRetentionYears, updatedBy: context.actor.id },
      select: { debtorDocumentRetentionYears: true, updatedAt: true },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: isFirstTime ? 'create' : 'update',
        targetType: TARGET,
        // PK ของตารางนี้คือ `organization_id` เอง
        targetId: organizationId,
        before: toDataRetentionAuditPayload({ debtorDocumentRetentionYears: current.debtorDocumentRetentionYears }),
        after: toDataRetentionAuditPayload(values),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return { debtorDocumentRetentionYears: updated.debtorDocumentRetentionYears, updatedAt: toIso(updated.updatedAt) }
}

/** ค่าที่ job ใช้ต่อองค์กร — ยังไม่มีแถว = ค่าเริ่มต้น (อ่านอย่างเดียว) */
export async function retentionYearsByOrganization(organizationIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await prisma.dataRetentionSettings.findMany({
    where: { organizationId: { in: [...organizationIds] } },
    select: { organizationId: true, debtorDocumentRetentionYears: true },
  })
  const byOrg = new Map(rows.map((row) => [row.organizationId, row.debtorDocumentRetentionYears]))
  return new Map(
    organizationIds.map((id) => [id, byOrg.get(id) ?? DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS]),
  )
}
