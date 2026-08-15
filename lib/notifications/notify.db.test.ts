import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของ Notification Service (PLAN §5.1 · `90` §6.3/§14):
 *  · แจ้งหลายคนพร้อมกัน = คนละแถว · ผู้รับซ้ำในลิสต์เดียวกันไม่ทำให้เกิดแถวซ้ำ
 *  · **idempotent**: ส่ง `dedupeKey` เดิมซ้ำ (job retry / duplicate delivery) ⇒ แถวเดิม ไม่เพิ่ม
 *  · ยิงพร้อมกันหลาย request ด้วย key เดียวกัน ⇒ ยัง 1 แถว (กันที่ PRIMARY KEY ไม่ใช่ที่แอป)
 *  · คนละ key = คนละแถว (เหตุการณ์คนละครั้งต้องแจ้งจริง) · ไม่ส่ง key = แจ้งทุกครั้งตามเดิม
 *  · กล่องของใครของมัน: list/mark เห็นเฉพาะของผู้เรียก · มาร์ค id ของคนอื่น = ไม่มีอะไรเปลี่ยน
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
  console.warn('[notify.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000051c0'
const ROLE_ID = '00000000-0000-4000-8000-0000000051c1'
const USER_A = '00000000-0000-4000-8000-0000000051c2'
const USER_B = '00000000-0000-4000-8000-0000000051c3'

let client: PrismaClient | null = null
type NotifyModule = typeof import('@/lib/notifications/notify')
type QueriesModule = typeof import('@/lib/notifications/queries')
let notify: NotifyModule
let queries: QueriesModule

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

function sessionUser(id: string): SessionUser {
  return {
    id,
    organizationId: ORG_ID,
    supabaseUid: `uid-${id}`,
    email: `${id}@test.local`,
    fullName: 'ผู้ทดสอบ 5.1',
    status: 'active',
    roleId: ROLE_ID,
    roleName: 'พนักงานติดตามทรัพย์ 5.1',
    roleGroup: 'inhouse',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'self', teamIds: [], companyId: null, userId: id },
    loginAt: new Date().toISOString(),
  }
}

const userA = sessionUser(USER_A)
const userB = sessionUser(USER_B)

function lotConfirmed(userIds: readonly string[], dedupeKey: string | null) {
  return {
    organizationId: ORG_ID,
    userIds,
    eventCode: 'lot.confirmed' as const,
    title: 'ยืนยันส่งมอบล็อตแล้ว',
    body: 'LOT-2569-001 ส่งมอบครบ 12 เครื่อง',
    linkPath: '/warehouse',
    dedupeKey,
  }
}

async function countFor(userId: string): Promise<number> {
  return await db().notification.count({ where: { organizationId: ORG_ID, userId } })
}

async function reset(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM notifications WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  notify = await import('@/lib/notifications/notify')
  queries = await import('@/lib/notifications/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'Phase51Test', '9999999995100', 'ที่อยู่ทดสอบ 5.1') ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'พนักงานติดตามทรัพย์ 5.1', 'inhouse', false) ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${USER_A}', '${ORG_ID}', '${ROLE_ID}', 'noti51a@test.local', 'ผู้รับ ก 5.1', 'active'),
      ('${USER_B}', '${ORG_ID}', '${ROLE_ID}', 'noti51b@test.local', 'ผู้รับ ข 5.1', 'active')
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

suite('notifyUsers() — สร้างแถวและกันซ้ำ (PLAN §5.1)', () => {
  it('แจ้งหลายคนพร้อมกัน = คนละแถว และผู้รับซ้ำในลิสต์เดียวกันนับครั้งเดียว', async () => {
    const result = await notify.notifyUsers(lotConfirmed([USER_A, USER_B, USER_A], null))

    expect(result.created).toBe(2)
    expect(await countFor(USER_A)).toBe(1)
    expect(await countFor(USER_B)).toBe(1)
  })

  it('ไม่มีผู้รับ = ไม่เขียนอะไรเลย (ไม่ใช่ error)', async () => {
    expect(await notify.notifyUsers(lotConfirmed([], 'lot-1'))).toEqual({ created: 0, skipped: 0, pushed: 0 })
  })

  it('ส่ง dedupeKey เดิมซ้ำ ⇒ แถวเดิม ไม่เพิ่ม (job retry ไม่สแปมผู้ใช้)', async () => {
    const first = await notify.notifyUsers(lotConfirmed([USER_A], 'lot-1'))
    const second = await notify.notifyUsers(lotConfirmed([USER_A], 'lot-1'))

    expect(first.created).toBe(1)
    expect(second).toEqual({ created: 0, skipped: 1, pushed: 0 })
    expect(await countFor(USER_A)).toBe(1)
  })

  it('ยิงพร้อมกัน 5 ครั้งด้วย key เดียวกัน ⇒ ยังได้แถวเดียว (กันที่ PRIMARY KEY)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => notify.notifyUsers(lotConfirmed([USER_A], 'lot-race'))),
    )

    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1)
    expect(await countFor(USER_A)).toBe(1)
  })

  it('คนละ dedupeKey = คนละเหตุการณ์ ⇒ ได้ 2 แถว', async () => {
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-1'))
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-2'))

    expect(await countFor(USER_A)).toBe(2)
  })

  it('dedupe แยกตามผู้รับ — key เดียวกันแต่คนละคนต้องได้ทั้งคู่', async () => {
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-1'))
    const second = await notify.notifyUsers(lotConfirmed([USER_A, USER_B], 'lot-1'))

    expect(second).toEqual({ created: 1, skipped: 1, pushed: 0 })
    expect(await countFor(USER_A)).toBe(1)
    expect(await countFor(USER_B)).toBe(1)
  })

  it('ไม่ส่ง dedupeKey = แจ้งใหม่ทุกครั้ง (พฤติกรรมเดิมของ 2.9 ไม่เปลี่ยน)', async () => {
    await notify.notifyUsers(lotConfirmed([USER_A], null))
    await notify.notifyUsers(lotConfirmed([USER_A], null))

    expect(await countFor(USER_A)).toBe(2)
  })
})

suite('กล่องแจ้งเตือนของใครของมัน (`90` §14)', () => {
  it('list เห็นเฉพาะของผู้เรียก + นับ unread/total ถูกต้อง', async () => {
    await notify.notifyUsers(lotConfirmed([USER_A, USER_B], 'lot-1'))
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-2'))

    const listA = await queries.listNotifications(userA)
    expect(listA.items).toHaveLength(2)
    expect(listA.totalCount).toBe(2)
    expect(listA.unreadCount).toBe(2)

    const listB = await queries.listNotifications(userB)
    expect(listB.totalCount).toBe(1)
  })

  it('filter=unread คืนเฉพาะที่ยังไม่อ่าน แต่ totalCount ยังนับทั้งกล่อง', async () => {
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-1'))
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-2'))
    const [first] = (await queries.listNotifications(userA)).items
    await queries.markNotificationsRead(userA, [first?.id ?? ''])

    const unread = await queries.listNotifications(userA, { filter: 'unread' })
    expect(unread.items).toHaveLength(1)
    expect(unread.unreadCount).toBe(1)
    expect(unread.totalCount).toBe(2)
  })

  it('มาร์ค id ของคนอื่น = ไม่มีอะไรเปลี่ยน (updated 0 — ไม่ leak ว่ามีจริง)', async () => {
    await notify.notifyUsers(lotConfirmed([USER_B], 'lot-1'))
    const [ofB] = (await queries.listNotifications(userB)).items

    expect(await queries.markNotificationsRead(userA, [ofB?.id ?? ''])).toEqual({ updated: 0 })
    expect((await queries.listNotifications(userB)).unreadCount).toBe(1)
  })

  it('มาร์คด้วยลิสต์ว่าง = ไม่แตะอะไรเลย (ไม่ใช่ "อ่านทั้งหมด")', async () => {
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-1'))

    expect(await queries.markNotificationsRead(userA, [])).toEqual({ updated: 0 })
    expect((await queries.listNotifications(userA)).unreadCount).toBe(1)
  })

  it('read-all มาร์คทั้งกล่องของตัวเอง และเรียกซ้ำได้ (รอบสอง updated 0)', async () => {
    await notify.notifyUsers(lotConfirmed([USER_A, USER_B], 'lot-1'))
    await notify.notifyUsers(lotConfirmed([USER_A], 'lot-2'))

    expect(await queries.markNotificationsRead(userA)).toEqual({ updated: 2 })
    expect(await queries.markNotificationsRead(userA)).toEqual({ updated: 0 })
    expect((await queries.listNotifications(userA)).unreadCount).toBe(0)
    // ของอีกคนต้องไม่ถูกแตะ
    expect((await queries.listNotifications(userB)).unreadCount).toBe(1)
  })

  it('เรียงใหม่สุดขึ้นก่อน และ limit ตัดจำนวนได้', async () => {
    for (let index = 0; index < 3; index += 1) {
      await notify.notifyUsers({ ...lotConfirmed([USER_A], `lot-${index}`), title: `ล็อตที่ ${index}` })
    }

    const limited = await queries.listNotifications(userA, { limit: 2 })
    expect(limited.items).toHaveLength(2)
    expect(limited.items[0]?.title).toBe('ล็อตที่ 2')
    expect(limited.totalCount).toBe(3)
  })
})
