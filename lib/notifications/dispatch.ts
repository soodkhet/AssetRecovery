import type { NotificationMessage } from '@/lib/notifications/messages'
import { notifyUsers, notifyUsersDetached } from '@/lib/notifications/notify'
import { usersWithCapability } from '@/lib/notifications/recipients'
import { prisma } from '@/lib/prisma'

/**
 * ตัวส่งการแจ้งเตือนของแต่ละโมดูล (Phase 5.2 — `90` §6.3)
 *
 * ทำไมต้องมีชั้นนี้: จุด emit จริงกระจายอยู่ใน `lib/<module>/queries.ts` ซึ่งอยู่ใน `$transaction`
 * ทั้งนั้น การแจ้งเตือนจึงต้อง (1) เกิด**หลัง** commit (2) ล้มแล้วห้ามพา flow ธุรกิจล้มตาม
 * (3) หาผู้รับจาก **capability** ไม่ใช่ชื่อ role (`lib/notifications/recipients.ts`)
 * — รวมไว้ที่เดียวเพื่อให้กติกาสามข้อนี้ไม่หลุดในโมดูลใดโมดูลหนึ่ง
 *
 * ข้อความทั้งหมดมาจาก `lib/notifications/messages.ts` (pure — เทสต์แยก)
 */

export interface DispatchTarget {
  organizationId: string
  userIds: readonly string[]
}

/** ส่งแบบ "ยิงแล้วลืม" — ใช้กับ endpoint ที่ผู้ใช้รอผลอยู่ (การแจ้งเตือนห้ามถ่วง response) */
export function dispatchNotification(target: DispatchTarget, message: NotificationMessage): void {
  const userIds = [...new Set(target.userIds)]
  if (userIds.length === 0) return
  notifyUsersDetached({
    organizationId: target.organizationId,
    userIds,
    eventCode: message.eventCode,
    title: message.title,
    body: message.body,
    linkPath: message.linkPath,
    dedupeKey: message.dedupeKey ?? null,
  })
}

/**
 * ส่งให้ "ทุกคนที่ถือ capability นี้" แบบยิงแล้วลืม — **ทางเข้าเดียว**ของ pattern นี้
 *
 * ⚠️ ห้ามเขียน `void usersWithCapability(...).then(...)` เองในโมดูล: `dispatchNotification()`
 * กัน error ของ *การส่ง* ไว้ก็จริง แต่ error ของ *การหาผู้รับ* (query Prisma ล้ม/DB หลุด) จะไม่มี
 * ใครรับ ⇒ unhandled rejection = Node ล้มโปรเซสทั้งตัว ซึ่งขัดกติกาข้อ (2) ด้านบนตรง ๆ
 */
export function dispatchToCapability(
  organizationId: string,
  capabilityCode: string,
  message: NotificationMessage,
): void {
  void usersWithCapability(organizationId, capabilityCode)
    .then((userIds) => {
      dispatchNotification({ organizationId, userIds }, message)
    })
    .catch((error: unknown) => {
      console.error('[notifications] หาผู้รับตาม capability ไม่สำเร็จ', {
        organizationId,
        capabilityCode,
        eventCode: message.eventCode,
        error,
      })
    })
}

/**
 * ส่งแบบรอผล — ใช้กับ **job** เท่านั้น (ต้องรู้ว่าเขียนแถวสำเร็จก่อนจบรอบ ไม่งั้น process ตาย
 * ระหว่าง fire-and-forget แล้วการเตือนหายไปเงียบ ๆ) · คืนจำนวนแถวที่สร้างจริง
 */
export async function dispatchNotificationAwaited(
  target: DispatchTarget,
  message: NotificationMessage,
): Promise<number> {
  const userIds = [...new Set(target.userIds)]
  if (userIds.length === 0) return 0
  const result = await notifyUsers({
    organizationId: target.organizationId,
    userIds,
    eventCode: message.eventCode,
    title: message.title,
    body: message.body,
    linkPath: message.linkPath,
    dedupeKey: message.dedupeKey ?? null,
  })
  return result.created
}

// ── ตัวช่วยหาผู้รับที่ใช้ซ้ำหลายโมดูล ────────────────────────────────────────

/** ผู้ส่งเคส (`cases.created_by`) — คนที่ต้องรับรู้ผลการพิจารณาเคส (`38` §10) */
export async function caseSubmitterIds(organizationId: string, caseId: string): Promise<string[]> {
  const row = await prisma.case.findFirst({
    where: { id: caseId, organizationId },
    select: { createdBy: true },
  })
  return row === null ? [] : [row.createdBy]
}

/** พนักงานภาคสนามที่ถือเคสอยู่ในรอบติดตามปัจจุบัน — ผู้รับผลตีกลับ/แจ้งเตือนงานของตัวเอง */
export async function activeAgentIds(organizationId: string, caseId: string): Promise<string[]> {
  const row = await prisma.caseAssignment.findFirst({
    where: {
      organizationId,
      caseId,
      status: { not: 'reassigned_away' },
    },
    orderBy: [{ trackingRound: 'desc' }, { createdAt: 'desc' }],
    select: { agentId: true },
  })
  return row === null ? [] : [row.agentId]
}

/** ผู้ใช้เจ้าของ Payee (ผู้รับเงินจริง) — ใช้กับรายการเบิก/เงินทดรอง (`18` §6) */
export async function payeeUserIds(organizationId: string, payeeIds: readonly string[]): Promise<string[]> {
  if (payeeIds.length === 0) return []
  const rows = await prisma.payeeProfile.findMany({
    where: { organizationId, id: { in: [...new Set(payeeIds)] }, deletedAt: null },
    select: { userId: true },
  })
  return [...new Set(rows.map((row) => row.userId))]
}

export { usersWithCapability }
