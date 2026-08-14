import { emitAudit } from '@/lib/audit/audit'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import type { PushSubscribeInput } from '@/lib/field/schemas'
import { prisma } from '@/lib/prisma'

/**
 * ทะเบียนอุปกรณ์รับ Web Push + กล่องแจ้งเตือนในแอป (`41` §15 · `90` §6.3)
 *
 * - subscribe ซ้ำจากเครื่องเดิม = **upsert ตาม `endpoint`** (UNIQUE ระดับ DB) ไม่เกิดแถวซ้ำ
 *   และ "คืนชีพ" แถวที่เคย soft delete ไปแล้ว (ผู้ใช้กดอนุญาตใหม่)
 * - ทุก mutation ผ่าน `emitAudit()` (Rule 03) — ไม่ต้องมี `reason` เพราะไม่กระทบเงิน/สิทธิ์
 *   (จัดหมวดไว้ที่ `lib/audit/reason-policy.ts` แล้ว)
 * - การอ่าน/มาร์คอ่าน จำกัดเฉพาะแถวของผู้เรียกเองเสมอ (ไม่มี endpoint ไหนอ่านของคนอื่นได้)
 */

export interface NotificationMutationContext {
  actor: SessionUser
  meta: RequestMeta
}

export interface PushSubscriptionDto {
  id: string
  endpoint: string
  createdAt: string
  lastSeenAt: string
}

export async function savePushSubscription(
  user: SessionUser,
  input: PushSubscribeInput,
  context: NotificationMutationContext,
  userAgent: string | null,
): Promise<PushSubscriptionDto> {
  const now = new Date()

  const row = await prisma.$transaction(async (tx) => {
    const saved = await tx.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        organizationId: user.organizationId,
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent,
        lastSeenAt: now,
        createdBy: context.actor.id,
      },
      update: {
        // อุปกรณ์เดิมอาจเปลี่ยนมือ/ผู้ใช้ล็อกอินใหม่ — ผูกกับผู้เรียกล่าสุดเสมอ
        organizationId: user.organizationId,
        userId: user.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent,
        lastSeenAt: now,
        failureCount: 0,
        deletedAt: null,
        updatedBy: context.actor.id,
      },
      select: { id: true, endpoint: true, createdAt: true, lastSeenAt: true },
    })

    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: 'push_subscriptions',
        targetId: saved.id,
        // ห้ามเก็บกุญแจของ subscription ลง audit (audit เก็บ 5 ปี ลบไม่ได้)
        after: { userId: user.id, userAgent, events: [] },
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx as Parameters<typeof emitAudit>[1],
    )

    return saved
  })

  return {
    id: row.id,
    endpoint: row.endpoint,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  }
}

/** ยกเลิกรับ push ของอุปกรณ์นั้น — soft delete เฉพาะแถวของผู้เรียกเอง */
export async function removePushSubscription(
  user: SessionUser,
  endpoint: string,
  context: NotificationMutationContext,
): Promise<{ removed: number }> {
  return await prisma.$transaction(async (tx) => {
    const removed = await tx.pushSubscription.updateMany({
      where: { endpoint, userId: user.id, organizationId: user.organizationId, deletedAt: null },
      data: { deletedAt: new Date(), updatedBy: context.actor.id },
    })

    if (removed.count > 0) {
      await emitAudit(
        {
          organizationId: user.organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'delete',
          targetType: 'push_subscriptions',
          targetId: user.id,
          before: { userId: user.id },
          after: { removed: removed.count },
          reason: 'ผู้ใช้ยกเลิกรับการแจ้งเตือนบนอุปกรณ์นี้ (`41` §15)',
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx as Parameters<typeof emitAudit>[1],
      )
    }

    return { removed: removed.count }
  })
}

export interface NotificationDto {
  id: string
  eventCode: string
  title: string
  body: string | null
  linkPath: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationListDto {
  items: NotificationDto[]
  unreadCount: number
}

/** กล่องแจ้งเตือนของผู้เรียกเอง (`41` §15 fallback) — badge cap ที่หน้าจอ (E11) */
export async function listNotifications(user: SessionUser, limit = 50): Promise<NotificationListDto> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, eventCode: true, title: true, body: true, linkPath: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, organizationId: user.organizationId, readAt: null } }),
  ])

  return {
    items: rows.map((row) => ({
      id: row.id,
      eventCode: row.eventCode,
      title: row.title,
      body: row.body,
      linkPath: row.linkPath,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    unreadCount,
  }
}

/**
 * มาร์คว่าอ่านแล้ว — ไม่ส่ง `ids` = อ่านทั้งหมดของตัวเอง (E11: เปิด dropdown ไม่ auto-mark
 * ⇒ หน้าจอเป็นคนตัดสินใจเรียกตัวนี้ตอนคลิกจริง)
 *
 * ไม่ลง audit: เป็นสถานะการอ่านของผู้ใช้เอง ไม่ใช่ข้อมูลธุรกิจ (`90` §6.3)
 */
export async function markNotificationsRead(user: SessionUser, ids?: readonly string[]): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: {
      userId: user.id,
      organizationId: user.organizationId,
      readAt: null,
      ...(ids !== undefined && ids.length > 0 ? { id: { in: [...ids] } } : {}),
    },
    data: { readAt: new Date() },
  })
  return { updated: result.count }
}
