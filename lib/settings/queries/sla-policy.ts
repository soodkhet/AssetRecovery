import { DEFAULT_SLA_ALERT_HOURS } from '@/lib/assignments/policy'
import { emitAudit } from '@/lib/audit/audit'
import { prisma } from '@/lib/prisma'
import { toSlaPolicyAuditPayload, type SlaPolicyValues } from '@/lib/settings/sla-policy'
import { toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { SlaPolicyDto } from '@/lib/settings/types'

/**
 * เกณฑ์ SLA ของงานติดตาม (`13` §6.14 — มติ PO 15/08/2569 · D18) — **1 record ต่อองค์กร**
 *
 * เก็บอยู่ในตาราง `assignment_policy_settings` (ค่าตั้งของงานมอบหมาย `40` §6.4) ⇒ endpoint นี้
 * **แตะเฉพาะคอลัมน์ `sla_alert_hours`** ห้ามเขียนทับคอลัมน์ `supervisor_can_assign_*` /
 * `reassign_timeout_hours` ของโมดูล 2.6 (คนละเจ้าของ คนละหน้าจอ)
 *
 * ⚠️ **GET ต้องไม่เขียน DB** (แนวเดียวกับ `queries/finance-policy.ts`): endpoint เปิดให้สิทธิ์ `view`
 * ⇒ อ่านแล้วสร้างแถวเท่ากับ mutation ที่ไม่มี audit · ยังไม่มีแถว = คืนค่าเริ่มต้นของสเปคเฉย ๆ
 * แถวเกิดตอน PATCH ครั้งแรก (upsert)
 */

const TARGET = 'assignment_policy_settings'

export async function getSlaPolicy(organizationId: string): Promise<SlaPolicyDto> {
  const row = await prisma.assignmentPolicySettings.findUnique({
    where: { organizationId },
    select: { slaAlertHours: true, updatedAt: true },
  })
  if (row === null) return { slaAlertHours: DEFAULT_SLA_ALERT_HOURS, updatedAt: null }
  return { slaAlertHours: row.slaAlertHours, updatedAt: toIso(row.updatedAt) }
}

export async function updateSlaPolicy(
  context: SettingsMutationContext,
  current: SlaPolicyDto,
  values: SlaPolicyValues,
): Promise<SlaPolicyDto> {
  const organizationId = context.actor.organizationId
  const isFirstTime = current.updatedAt === null

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.assignmentPolicySettings.upsert({
      where: { organizationId },
      // แถวใหม่ได้ค่าตั้งต้นของคอลัมน์อื่นจาก `@default` ใน schema (`40` §6.4) — ไม่ระบุทับที่นี่
      create: { organizationId, slaAlertHours: values.slaAlertHours, updatedBy: context.actor.id },
      update: { slaAlertHours: values.slaAlertHours, updatedBy: context.actor.id },
      select: { slaAlertHours: true, updatedAt: true },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: isFirstTime ? 'create' : 'update',
        targetType: TARGET,
        // PK ของตารางนี้คือ `organization_id` เอง (`02` §5)
        targetId: organizationId,
        ...(isFirstTime ? {} : { before: toSlaPolicyAuditPayload({ slaAlertHours: current.slaAlertHours }) }),
        after: toSlaPolicyAuditPayload(values),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return { slaAlertHours: updated.slaAlertHours, updatedAt: toIso(updated.updatedAt) }
}
