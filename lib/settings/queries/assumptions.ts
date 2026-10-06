import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  SETTING_ASSUMPTIONS,
  settingAssumptionStatuses,
  type SettingAssumptionKey,
  type SettingAssumptionStatusDto,
} from '@/lib/settings/assumptions'
import type { SettingsMutationContext } from '@/lib/settings/queries/shared'

/**
 * ป้าย "รอนักบัญชียืนยัน" บนหน้าตั้งค่า (มติ PO 07/10/2569 U140) — ชั้น DB
 * แถว `setting_assumption_confirmations` insert-only (trigger) · 1 แถวต่อองค์กรต่อรายการ (unique)
 */

const TARGET = 'setting_assumption_confirmations'

async function loadStatuses(organizationId: string): Promise<SettingAssumptionStatusDto[]> {
  const rows = await prisma.settingAssumptionConfirmation.findMany({
    where: { organizationId },
    select: { assumptionKey: true, confirmedAt: true, reason: true, confirmedByUser: { select: { fullName: true } } },
  })
  return settingAssumptionStatuses(
    rows.map((row) => ({
      assumptionKey: row.assumptionKey,
      confirmedAt: row.confirmedAt,
      reason: row.reason,
      confirmedByName: row.confirmedByUser.fullName,
    })),
  )
}

/** `GET /api/settings/assumptions` — ทุกรายการพร้อมสถานะยืนยัน (ลำดับตามทะเบียน) */
export async function listSettingAssumptions(organizationId: string): Promise<SettingAssumptionStatusDto[]> {
  return loadStatuses(organizationId)
}

/**
 * `POST /api/settings/assumptions/:key/confirm` — บัญชียืนยันว่านักบัญชีตอบแล้ว ⇒ ป้ายหาย
 * ยืนยันซ้ำ (หรือกดพร้อมกันสองคน) = คืนสถานะเดิม ไม่เขียนแถว/ audit ซ้ำ (idempotent)
 */
export async function confirmSettingAssumption(
  context: SettingsMutationContext,
  key: SettingAssumptionKey,
  now: Date = new Date(),
): Promise<SettingAssumptionStatusDto> {
  const organizationId = context.actor.organizationId
  const meta = SETTING_ASSUMPTIONS[key]
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.settingAssumptionConfirmation.create({
        data: {
          organizationId,
          assumptionKey: key,
          reason: context.reason,
          confirmedAt: now,
          confirmedBy: context.actor.id,
        },
        select: { id: true },
      })
      await emitAudit(
        {
          organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'create',
          targetType: TARGET,
          targetId: created.id,
          before: { assumption_key: key, confirmed: false },
          after: { assumption_key: key, label: meta.label, confirmed: true, confirmed_at: now.toISOString() },
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx,
      )
    })
  } catch (error) {
    // ยืนยันไปแล้ว (unique) — ไม่ใช่ error ของผู้ใช้ คืนสถานะปัจจุบัน
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
  }
  const statuses = await loadStatuses(organizationId)
  return statuses.find((status) => status.key === key)!
}
