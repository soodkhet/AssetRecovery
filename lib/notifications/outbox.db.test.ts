import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type { NotificationMessage } from '@/lib/notifications/messages'
import { outboxMessageEntries } from '@/lib/notifications/outbox-core'

/**
 * เทสต์ระดับ DB ของคิวแจ้งเตือน (DEC-015 · มติ PO U120):
 *  · เข้าคิวใน `$transaction` ที่ rollback ⇒ ไม่มีแถวคิว (ค)
 *  · ตัวส่งหลายตัวพร้อมกัน / ส่งซ้ำ ⇒ แจ้งเตือนแถวเดียว (ข)
 *  · ส่งไม่สำเร็จ ⇒ แถวยังอยู่ + `last_error` + นับ `attempts` · ครบเพดาน ⇒ `failed` · ไม่โยน error
 *  · เข้าคิวซ้ำ (job รันซ้ำ) ⇒ แถวเดียว (UNIQUE ต่อองค์กร)
 *
 * ส่วน "job เปลี่ยนสถานะแล้วส่งล้ม → รอบถัดไปส่งสำเร็จ" (ก) อยู่ที่ `lib/advances/advance-queries.db.test.ts`
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service (กับดัก 2026-08-14)
 */

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  if (!isLocal || !parsed.pathname.includes('test')) {
    throw new Error(`TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname}) — Rule 07`)
  }
}

const suite = url ? describe : describe.skip
if (!url) {
  console.warn('[outbox.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000120a0'
const ROLE_ID = '00000000-0000-4000-8000-0000000120a1'
const USER_A = '00000000-0000-4000-8000-0000000120a2'
/** ไม่มีในตาราง `users` ⇒ เขียน `notifications` ไม่ผ่าน FK = ความล้มเหลวจริงของขั้นส่ง (ไม่ต้อง mock) */
const GHOST_USER = '00000000-0000-4000-8000-0000000120af'

let client: PrismaClient | null = null
type OutboxModule = typeof import('@/lib/notifications/outbox')
let outbox: OutboxModule

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const SOURCE = { jobType: 'advance_overdue', jobRef: 'outbox-test' }

function overdueMessage(dedupeKey: string): NotificationMessage {
  return {
    eventCode: 'advance.overdue',
    title: 'เงินทดรองเลยกำหนดเคลียร์',
    body: 'กรุณาเคลียร์ยอดเงินทดรอง',
    linkPath: '/field/advances',
    dedupeKey,
  }
}

async function reset(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM notification_outbox WHERE organization_id = '${ORG_ID}'`)
}

async function notificationCount(): Promise<number> {
  return await db().notification.count({ where: { organizationId: ORG_ID, eventCode: 'advance.overdue' } })
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  outbox = await import('@/lib/notifications/outbox')

  await db().$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'OutboxTest', '9999999912000', 'ที่อยู่ทดสอบคิวแจ้งเตือน') ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'พนักงานทดสอบคิว', 'inhouse', false) ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_A}', '${ORG_ID}', '${ROLE_ID}', 'outbox-a@test.local', 'ผู้รับคิว ก', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  if (url) await reset()
  await client?.$disconnect()
})

beforeEach(async () => {
  if (url) await reset()
})

suite('notification_outbox — เข้าคิวในทรานแซกชัน (DEC-015)', () => {
  it('(ค) ทรานแซกชันเปลี่ยนสถานะ rollback ⇒ ไม่มีแถวคิว และไม่มีแจ้งเตือน', async () => {
    await expect(
      db().$transaction(async (tx) => {
        await outbox.enqueueNotificationOutbox(tx, outboxMessageEntries(ORG_ID, [USER_A], overdueMessage('adv-rb')), SOURCE)
        throw new Error('จำลอง: ขั้นเปลี่ยนสถานะล้ม')
      }),
    ).rejects.toThrow('จำลอง')

    expect(await db().notificationOutbox.count({ where: { organizationId: ORG_ID } })).toBe(0)
    await outbox.drainNotificationOutbox({ organizationId: ORG_ID })
    expect(await notificationCount()).toBe(0)
  })

  it('เข้าคิวซ้ำด้วยเหตุการณ์เดิม (job รันซ้ำ) ⇒ แถวเดียว · เก็บ job ที่เข้าคิวไว้ตามรอย', async () => {
    const entries = outboxMessageEntries(ORG_ID, [USER_A], overdueMessage('adv-dup'))
    expect(await db().$transaction((tx) => outbox.enqueueNotificationOutbox(tx, entries, SOURCE))).toBe(1)
    expect(await db().$transaction((tx) => outbox.enqueueNotificationOutbox(tx, entries, SOURCE))).toBe(0)

    const rows = await db().notificationOutbox.findMany({
      where: { organizationId: ORG_ID },
      select: { status: true, attempts: true, sourceJobType: true, sourceJobRef: true },
    })
    expect(rows).toEqual([{ status: 'pending', attempts: 0, sourceJobType: 'advance_overdue', sourceJobRef: 'outbox-test' }])
  })
})

suite('notification_outbox — ตัวส่ง (DEC-015)', () => {
  it('ส่งสำเร็จ ⇒ แจ้งเตือน 1 แถว + มาร์ค sent · รอบถัดไปไม่มีอะไรให้ส่ง', async () => {
    await db().$transaction((tx) =>
      outbox.enqueueNotificationOutbox(tx, outboxMessageEntries(ORG_ID, [USER_A], overdueMessage('adv-ok')), SOURCE),
    )

    const first = await outbox.drainNotificationOutbox({ organizationId: ORG_ID })
    expect(first).toMatchObject({ due: 1, sent: 1, notificationsCreated: 1, failed: 0, retried: 0 })
    expect(await notificationCount()).toBe(1)

    const row = await db().notificationOutbox.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(row.status).toBe('sent')
    expect(row.sentAt).not.toBeNull()
    expect(row.attempts).toBe(1)

    const second = await outbox.drainNotificationOutbox({ organizationId: ORG_ID })
    expect(second.due).toBe(0)
    expect(await notificationCount()).toBe(1)
  })

  it('(ข) ตัวส่ง 5 ตัวพร้อมกัน ⇒ จองได้ตัวเดียว · แจ้งเตือนแถวเดียว', async () => {
    await db().$transaction((tx) =>
      outbox.enqueueNotificationOutbox(tx, outboxMessageEntries(ORG_ID, [USER_A], overdueMessage('adv-race')), SOURCE),
    )

    const results = await Promise.all(
      Array.from({ length: 5 }, () => outbox.drainNotificationOutbox({ organizationId: ORG_ID })),
    )
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1)
    expect(await notificationCount()).toBe(1)
  })

  it('(ข) ตัวส่งตายหลังเขียนแจ้งเตือนแต่ก่อนมาร์ค sent ⇒ รอบหน้าส่งซ้ำก็ยังได้แถวเดิม (dedupe)', async () => {
    await db().$transaction((tx) =>
      outbox.enqueueNotificationOutbox(tx, outboxMessageEntries(ORG_ID, [USER_A], overdueMessage('adv-crash')), SOURCE),
    )
    // จำลองรอบที่ตายกลางทาง: แจ้งเตือนถูกเขียนไปแล้ว แถวคิวยังเป็น pending
    const { dispatchNotificationAwaited } = await import('@/lib/notifications/dispatch')
    expect(await dispatchNotificationAwaited({ organizationId: ORG_ID, userIds: [USER_A] }, overdueMessage('adv-crash'))).toBe(1)

    const result = await outbox.drainNotificationOutbox({ organizationId: ORG_ID })
    expect(result).toMatchObject({ sent: 1, notificationsCreated: 0 })
    expect(await notificationCount()).toBe(1)
  })

  it('ส่งไม่สำเร็จ ⇒ ไม่โยน error · แถวยังอยู่พร้อม last_error/attempts · รอ backoff · ครบเพดาน = failed', async () => {
    const entries = outboxMessageEntries(ORG_ID, [GHOST_USER], overdueMessage('adv-ghost'))
    await db().$transaction((tx) => outbox.enqueueNotificationOutbox(tx, entries, SOURCE))
    await db().notificationOutbox.updateMany({ where: { organizationId: ORG_ID }, data: { maxAttempts: 2 } })

    const now = new Date()
    const first = await outbox.drainNotificationOutbox({ organizationId: ORG_ID, now })
    expect(first).toMatchObject({ due: 1, sent: 0, retried: 1, failed: 0 })
    let row = await db().notificationOutbox.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.lastError).not.toBeNull()
    expect(row.availableAt.getTime()).toBeGreaterThan(now.getTime())

    // ยังไม่ถึงเวลา backoff ⇒ ไม่หยิบ
    expect((await outbox.drainNotificationOutbox({ organizationId: ORG_ID, now })).due).toBe(0)

    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const second = await outbox.drainNotificationOutbox({ organizationId: ORG_ID, now: later })
    expect(second).toMatchObject({ due: 1, failed: 1 })
    row = await db().notificationOutbox.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(row.status).toBe('failed')
    expect(row.attempts).toBe(2)
    expect(await notificationCount()).toBe(0)
  })

  it('payload ผิดรูป ⇒ failed ทันที (ลองซ้ำก็ไม่ผ่าน)', async () => {
    await db().notificationOutbox.create({
      data: {
        organizationId: ORG_ID,
        dedupeKey: 'broken',
        payload: { kind: 'unknown' },
        sourceJobType: 'advance_overdue',
      },
    })
    const result = await outbox.drainNotificationOutbox({ organizationId: ORG_ID })
    expect(result).toMatchObject({ due: 1, failed: 1 })
    const row = await db().notificationOutbox.findFirstOrThrow({ where: { organizationId: ORG_ID } })
    expect(row.status).toBe('failed')
    expect(row.lastError).toContain('payload')
  })
})
