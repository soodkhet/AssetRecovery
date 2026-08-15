import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

/**
 * Web Push ตาม `41` §15 (**ไม่ใช่ FCM**) — ทำงานผ่านเบราว์เซอร์/PWA โดยตรง
 *
 * - **ไม่ใช่ช่องทางเดียว**: fallback หลักคือ in-app notification เสมอ ⇒ ส่ง push ล้มเหลว
 *   ต้อง **ไม่** ทำให้ business flow ล้มตาม (`41` §15) — ทุกฟังก์ชันที่นี่กลืน error เอง
 * - iOS Safari ได้ push เฉพาะเมื่อผู้ใช้ "เพิ่มลงหน้าจอโฮม" แล้ว — ไม่บังคับ (แค่แนะนำตอน onboarding)
 * - subscription หลุดเองได้ (404/410 จากปลายทาง) ⇒ soft delete แถวนั้นทิ้งเงียบ ๆ
 * - ยังไม่ได้ตั้ง VAPID key = ระบบทำงานได้ปกติ แค่ไม่มี push (แจ้งเตือนในแอปยังครบ)
 */

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  return {
    publicKey,
    privateKey,
    // RFC 8292 บังคับให้ระบุช่องทางติดต่อเจ้าของ application server
    subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:ops@assetrecovery.local',
  }
}

export interface PushPayload {
  title: string
  body?: string | null
  /** deep link ในแอป — service worker เอาไปเปิดตอนผู้ใช้กดการแจ้งเตือน */
  linkPath?: string | null
  eventCode: string
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** ปลายทางที่บอกว่า subscription ตายแล้ว — เลิกส่งและปิดแถวนั้น */
const GONE_STATUS = new Set([404, 410])

async function deliver(subscription: SubscriptionRow, payload: PushPayload, config: VapidConfig): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey } },
    )
    return true
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status !== undefined && GONE_STATUS.has(status)) {
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { deletedAt: new Date(), failureCount: { increment: 1 } },
      })
      return false
    }
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { failureCount: { increment: 1 } },
    })
    return false
  }
}

/**
 * ส่ง push ให้ทุกอุปกรณ์ของผู้ใช้กลุ่มหนึ่ง — คืนจำนวนที่ส่งสำเร็จ
 * **ห้ามเรียกใน `$transaction`** (เป็น I/O ภายนอก) — เรียกหลัง commit เสมอ
 */
export async function sendPushToUsers(
  userIds: readonly string[],
  payload: PushPayload,
  /** ยามชั้นสุดท้ายของ multi-tenant (Rule 02) — ผู้เรียกกรอง org มาแล้ว แต่ที่นี่ต้องไม่พึ่งอย่างเดียว */
  organizationId?: string,
): Promise<number> {
  const config = getVapidConfig()
  if (config === null || userIds.length === 0) return 0

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId: { in: [...userIds] },
      deletedAt: null,
      ...(organizationId === undefined ? {} : { organizationId }),
    },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })

  const results = await Promise.all(subscriptions.map((row) => deliver(row, payload, config)))
  return results.filter(Boolean).length
}
