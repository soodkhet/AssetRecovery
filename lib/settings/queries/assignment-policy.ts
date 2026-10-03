import { emitAudit } from '@/lib/audit/audit'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_ASSIGNMENT_POLICY_VALUES,
  toAssignmentPolicyAuditPayload,
  type AssignmentPolicyValues,
} from '@/lib/settings/assignment-policy'
import { toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { AssignmentPolicyDto } from '@/lib/settings/types'

/**
 * นโยบายการมอบหมายงาน (`40` §6.4/§11/§13 — UAT BUG-002 · มติ PO 03/10/2569) — **1 record ต่อองค์กร**
 *
 * ตาราง `assignment_policy_settings` แถวเดียวกับเกณฑ์ SLA (`queries/sla-policy.ts`) ⇒ endpoint นี้
 * **แตะเฉพาะ 5 คอลัมน์ของไฟล์ 40** (`reassign_timeout_hours`, `supervisor_can_assign_*`,
 * `accept_deadline_hours`) ห้ามเขียนทับ `sla_alert_hours`
 *
 * ค่าใหม่มีผลกับ**คำขอใหม่เท่านั้น**: คำขอเปลี่ยนผู้รับผิดชอบที่ค้างอยู่ snapshot `expires_at` ไว้แล้วตอนสร้าง
 * (`lib/assignments/queries.ts` → `reassignmentExpiresAt()`) และ timeout job อ่าน `expires_at` ที่เก็บไว้
 *
 * ⚠️ **GET ต้องไม่เขียน DB** (แนวเดียวกับ `queries/sla-policy.ts`) — ยังไม่มีแถว = คืนค่าเริ่มต้นของสเปค
 * แถวเกิดตอน PATCH ครั้งแรก (upsert)
 */

const TARGET = 'assignment_policy_settings'

const SELECT = {
  reassignTimeoutHours: true,
  supervisorCanAssignSystem: true,
  supervisorCanAssignInhouse: true,
  supervisorCanAssignOutsource: true,
  acceptDeadlineHours: true,
  updatedAt: true,
} as const

interface PolicyRow extends AssignmentPolicyValues {
  updatedAt: Date
}

function valuesOf(row: AssignmentPolicyValues): AssignmentPolicyValues {
  return {
    reassignTimeoutHours: row.reassignTimeoutHours,
    supervisorCanAssignSystem: row.supervisorCanAssignSystem,
    supervisorCanAssignInhouse: row.supervisorCanAssignInhouse,
    supervisorCanAssignOutsource: row.supervisorCanAssignOutsource,
    acceptDeadlineHours: row.acceptDeadlineHours,
  }
}

function toDto(row: PolicyRow): AssignmentPolicyDto {
  return { ...valuesOf(row), updatedAt: toIso(row.updatedAt) }
}

export async function getAssignmentPolicySettings(organizationId: string): Promise<AssignmentPolicyDto> {
  const row = await prisma.assignmentPolicySettings.findUnique({ where: { organizationId }, select: SELECT })
  if (row === null) return { ...DEFAULT_ASSIGNMENT_POLICY_VALUES, updatedAt: null }
  return toDto(row)
}

export async function updateAssignmentPolicySettings(
  context: SettingsMutationContext,
  values: AssignmentPolicyValues,
): Promise<AssignmentPolicyDto> {
  const organizationId = context.actor.organizationId
  const data = { ...valuesOf(values), updatedBy: context.actor.id }

  const updated = await prisma.$transaction(async (tx) => {
    // อ่านค่าเดิมใน transaction เดียวกับการเขียน — `before` ของ audit ต้องตรงกับแถวที่ถูกทับจริง
    const before = await tx.assignmentPolicySettings.findUnique({ where: { organizationId }, select: SELECT })

    const row = await tx.assignmentPolicySettings.upsert({
      where: { organizationId },
      // แถวใหม่: `sla_alert_hours` ได้ค่าตั้งต้นจาก `@default` ใน schema — ไม่ระบุทับที่นี่
      create: { organizationId, ...data },
      update: data,
      select: SELECT,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: before === null ? 'create' : 'update',
        targetType: TARGET,
        // PK ของตารางนี้คือ `organization_id` เอง (`02` §5)
        targetId: organizationId,
        ...(before === null ? {} : { before: toAssignmentPolicyAuditPayload(valuesOf(before)) }),
        after: toAssignmentPolicyAuditPayload(values),
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
