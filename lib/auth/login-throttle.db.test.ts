import { randomInt, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * preship PS-009 — นับ login ที่ผิดจาก audit จริง (JSON path ของ after_data + เทียบ IP ชนิด inet)
 * audit ลบไม่ได้ (immutable) ⇒ ทุกรอบใช้ identifier/IP ใหม่ที่สุ่ม แถวเก่าของรอบก่อนจึงไม่ปน
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORG_ID = '00000000-0000-4000-8000-0000005e9a00'

let throttle: typeof import('@/lib/auth/login-throttle-queries')
let audit: typeof import('@/lib/audit/audit')
let prisma: typeof import('@/lib/prisma').prisma

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname) || !parsed.pathname.includes('test')) {
    throw new Error('TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น — Rule 07')
  }
}

async function failedLogin(identifier: string, ipAddress: string, code = 'INVALID_CREDENTIALS'): Promise<void> {
  await audit.emitAudit({
    organizationId: ORG_ID,
    actorId: null,
    actorRole: null,
    action: 'login',
    targetType: 'users',
    targetId: null,
    after: { result: 'failed', code, identifier },
    ipAddress,
    userAgent: 'vitest',
  })
}

const freshIdentifier = () => `ps009.${randomUUID().slice(0, 8)}`
const freshIp = () => `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`

beforeAll(async () => {
  if (!url) return
  assertLocalTestDatabase(url)
  process.env.DATABASE_URL = url
  throttle = await import('@/lib/auth/login-throttle-queries')
  audit = await import('@/lib/audit/audit')
  prisma = (await import('@/lib/prisma')).prisma
  await prisma.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'PS009Test', '9999999900900', 'ที่อยู่ทดสอบ PS009') ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  await prisma?.$disconnect()
})

suite('loginThrottled — นับจาก audit login ที่ผิด', () => {
  it('ผิด 4 ครั้งยังลองได้ · ครั้งที่ 5 ถูกพัก (รายบัญชี)', async () => {
    const identifier = freshIdentifier()
    const ip = freshIp()
    for (let i = 0; i < 4; i += 1) await failedLogin(identifier, freshIp())
    expect(await throttle.loginThrottled({ organizationId: ORG_ID, identifier, ipAddress: ip })).toBe(false)
    await failedLogin(identifier, freshIp())
    expect(await throttle.loginThrottled({ organizationId: ORG_ID, identifier, ipAddress: ip })).toBe(true)
  })

  it('ครั้งที่ถูกพัก (LOGIN_RATE_LIMITED) และ error อื่นไม่นับเป็นครั้งที่ผิด', async () => {
    const identifier = freshIdentifier()
    for (let i = 0; i < 4; i += 1) await failedLogin(identifier, freshIp())
    await failedLogin(identifier, freshIp(), 'LOGIN_RATE_LIMITED')
    await failedLogin(identifier, freshIp(), 'ACCOUNT_INACTIVE')
    expect(await throttle.loginThrottled({ organizationId: ORG_ID, identifier, ipAddress: null })).toBe(false)
  })

  it('ไล่เดาหลายบัญชีจาก IP เดียว 30 ครั้ง ⇒ พัก IP นั้น (บัญชีใหม่ก็ถูกพัก)', async () => {
    const ip = freshIp()
    for (let i = 0; i < 30; i += 1) await failedLogin(freshIdentifier(), ip)
    expect(await throttle.loginThrottled({ organizationId: ORG_ID, identifier: freshIdentifier(), ipAddress: ip })).toBe(true)
    expect(await throttle.loginThrottled({ organizationId: ORG_ID, identifier: freshIdentifier(), ipAddress: freshIp() })).toBe(false)
  })

  it('พ้น 15 นาทีแล้วเข้าได้ (นับย้อนหลังจาก now)', async () => {
    const identifier = freshIdentifier()
    for (let i = 0; i < 5; i += 1) await failedLogin(identifier, freshIp())
    const later = new Date(Date.now() + 16 * 60 * 1000)
    expect(await throttle.loginThrottled({ organizationId: ORG_ID, identifier, ipAddress: null, now: later })).toBe(false)
  })
})
