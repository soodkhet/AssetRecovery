import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'

/**
 * เทสต์ระดับ DB ของตัวรันงานเบื้องหลัง (Phase 5.3 — `91` §6.2/§11/§14/§16):
 *  · idempotency: ยิงสร้างด้วยคีย์เดิมซ้ำ (รวมกรณี**พร้อมกัน**) ต้องได้ job เดิม ไม่เกิดแถวใหม่
 *  · claim ด้วย conditional update — ตัวรันงานสองตัวหยิบพร้อมกัน มีตัวเดียวที่ได้ทำ
 *  · retry/backoff → กลับเข้าคิว · ครบเพดาน → dead letter (ไม่ retry ต่อเอง)
 *  · job_type ที่ไม่มี handler = dead letter ทันที (ไม่เผารอบ retry ให้เปล่า)
 *  · สิทธิ์หน้า Job Log: Company User 403 · retry เฉพาะ Superadmin + ต้องมีเหตุผล
 *
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` ก่อน import service (กับดักเดิมของไฟล์ `.db.test`)
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
  console.warn('[engine.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

const ORG_ID = '00000000-0000-4000-8000-0000000053a0'
const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000053a1'
const ROLE_ID = '00000000-0000-4000-8000-0000000053a2'
const OTHER_ROLE_ID = '00000000-0000-4000-8000-0000000053a3'
const ADMIN_ID = '00000000-0000-4000-8000-0000000053a4'
const EXEC_ID = '00000000-0000-4000-8000-0000000053a5'
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000053a6'

let client: PrismaClient | null = null
type Engine = typeof import('@/lib/jobs/engine')
type Queries = typeof import('@/lib/jobs/queries')
let engine: Engine
let queries: Queries

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

function sessionUser(overrides: Partial<SessionUser> & Pick<SessionUser, 'id'>): SessionUser {
  return {
    organizationId: ORG_ID,
    supabaseUid: `uid-${overrides.id}`,
    email: `${overrides.id}@test.local`,
    fullName: 'ผู้ทดสอบ 5.3',
    status: 'active',
    roleId: ROLE_ID,
    roleName: 'บริหาร',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: { manage_jobs: 'manage' },
    scope: { kind: 'global', teamIds: [], companyId: null, userId: overrides.id },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const superadmin = sessionUser({ id: ADMIN_ID, isSuperadmin: true, roleName: 'Superadmin' })
const executive = sessionUser({ id: EXEC_ID, capabilities: { manage_jobs: 'view' } })
const companyUser = sessionUser({
  id: EXEC_ID,
  roleName: 'ผู้ใช้บริษัทไฟแนนซ์',
  roleGroup: 'finance_company',
  scope: { kind: 'company', teamIds: [], companyId: '00000000-0000-4000-8000-0000000053d1', userId: EXEC_ID },
})

const meta = { ipAddress: null, userAgent: null }
const baseQuery = { limit: 50, offset: 0 } as const

/** งานทดสอบใช้ job_type ที่ไม่มี handler เสมอ — จะได้ไม่ไปแตะข้อมูลโมดูลอื่นตอนรัน */
const UNKNOWN_TYPE = 'phase53_unknown' as never

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  engine = await import('@/lib/jobs/engine')
  queries = await import('@/lib/jobs/queries')

  const tx = db()
  await tx.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address) VALUES
      ('${ORG_ID}', 'Phase53Test', '9999999995300', 'ที่อยู่ทดสอบ 5.3'),
      ('${OTHER_ORG_ID}', 'Phase53Other', '9999999995301', 'ที่อยู่ทดสอบ 5.3 องค์กรอื่น')
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed) VALUES
      ('${ROLE_ID}', '${ORG_ID}', 'บริหาร 5.3', 'system', false),
      ('${OTHER_ROLE_ID}', '${OTHER_ORG_ID}', 'บริหาร 5.3 อื่น', 'system', false)
    ON CONFLICT (id) DO NOTHING
  `)
  await tx.$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status) VALUES
      ('${ADMIN_ID}', '${ORG_ID}', '${ROLE_ID}', 'admin53@test.local', 'ผู้ดูแลระบบ 5.3', 'active'),
      ('${EXEC_ID}', '${ORG_ID}', '${ROLE_ID}', 'exec53@test.local', 'ผู้บริหาร 5.3', 'active'),
      ('${OTHER_USER_ID}', '${OTHER_ORG_ID}', '${OTHER_ROLE_ID}', 'other53@test.local', 'คนองค์กรอื่น 5.3', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
})

beforeEach(async () => {
  if (!url) return
  // ล้างเฉพาะงานของสององค์กรทดสอบ + งานระดับระบบที่เทสต์นี้สร้างเอง (คีย์ขึ้นต้น `test53:`)
  await db().$executeRawUnsafe(`
    DELETE FROM jobs
     WHERE organization_id IN ('${ORG_ID}', '${OTHER_ORG_ID}')
        OR payload->>'idempotencyKey' LIKE 'test53:%'
  `)
})

afterAll(async () => {
  await client?.$disconnect()
})

async function seedJob(overrides: Record<string, unknown> = {}) {
  return engine.enqueueJob({
    organizationId: ORG_ID,
    jobType: UNKNOWN_TYPE,
    idempotencyKey: `test53:${Math.random().toString(36).slice(2)}`,
    createdBy: ADMIN_ID,
    actorRole: 'Superadmin',
    ...overrides,
  })
}

suite('idempotency ของการสร้าง job (`91` §11/§16 · `01` §11)', () => {
  it('คีย์เดิม = คืน job เดิม ไม่สร้างแถวใหม่', async () => {
    const key = 'test53:same-key'
    const first = await engine.enqueueJob({
      organizationId: ORG_ID,
      jobType: UNKNOWN_TYPE,
      idempotencyKey: key,
      payload: { a: 1 },
      createdBy: ADMIN_ID,
    })
    const second = await engine.enqueueJob({
      organizationId: ORG_ID,
      jobType: UNKNOWN_TYPE,
      idempotencyKey: key,
      payload: { a: 2 },
      createdBy: ADMIN_ID,
    })

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.job.id).toBe(first.job.id)
    // payload ของครั้งแรกต้องไม่ถูกทับ (คืนของเดิมจริง ๆ ไม่ใช่สร้างใหม่)
    expect((second.job.payload as { a: number }).a).toBe(1)

    const count = await db().job.count({ where: { organizationId: ORG_ID } })
    expect(count).toBe(1)
  })

  it('ยิงพร้อมกันด้วยคีย์เดียวกัน — ตัวที่แพ้ index อ่านของเดิมกลับมา ไม่เกิด job ซ้อน', async () => {
    const key = 'test53:race-key'
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        engine.enqueueJob({ organizationId: ORG_ID, jobType: UNKNOWN_TYPE, idempotencyKey: key, createdBy: ADMIN_ID }),
      ),
    )

    const ids = new Set(results.map((result) => result.job.id))
    expect(ids.size).toBe(1)
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1)
    expect(await db().job.count({ where: { organizationId: ORG_ID } })).toBe(1)
  })

  it('คีย์เดียวกันคนละองค์กร = คนละงาน (ไม่กลืนกัน ไม่คืนงานขององค์กรอื่น)', async () => {
    const key = 'test53:shared-key'
    const mine = await engine.enqueueJob({
      organizationId: ORG_ID,
      jobType: UNKNOWN_TYPE,
      idempotencyKey: key,
      createdBy: ADMIN_ID,
    })
    const other = await engine.enqueueJob({
      organizationId: OTHER_ORG_ID,
      jobType: UNKNOWN_TYPE,
      idempotencyKey: key,
      createdBy: OTHER_USER_ID,
    })

    expect(mine.duplicate).toBe(false)
    expect(other.duplicate).toBe(false)
    expect(other.job.id).not.toBe(mine.job.id)
    expect(other.job.organizationId).toBe(OTHER_ORG_ID)
  })

  it('ตัวตั้งเวลายิงซ้ำในช่องเวลาเดิม = ไม่มีงานเพิ่ม', async () => {
    const at = new Date('2026-08-15T10:03:00Z')
    const first = await engine.enqueueScheduledJobs(at)
    const second = await engine.enqueueScheduledJobs(new Date('2026-08-15T10:08:00Z'))

    expect(first.enqueued).toBeGreaterThan(0)
    expect(second.enqueued).toBe(0)
    expect(second.duplicated).toBe(first.enqueued)

    // เก็บกวาดงานระดับระบบที่เพิ่งตั้ง (organization_id NULL — `beforeEach` ไม่ครอบคลุมคีย์ `cron:`)
    await db().$executeRawUnsafe(`DELETE FROM jobs WHERE payload->>'idempotencyKey' LIKE 'cron:%'`)
  })
})

suite('การหยิบงานและรอบ retry (`91` §6.2/§10)', () => {
  it('ตัวรันงานสองตัวหยิบพร้อมกัน — มีตัวเดียวที่ได้ทำ อีกตัวข้ามเงียบ ๆ', async () => {
    const { job } = await seedJob()
    const [a, b] = await Promise.all([engine.runJob(job), engine.runJob(job)])
    expect([a, b].filter((outcome) => outcome === 'skipped')).toHaveLength(1)
  })

  it('job_type ที่ไม่มี handler = dead letter ทันที ไม่เผารอบ retry', async () => {
    const { job } = await seedJob()
    const outcome = await engine.runJob(job, new Date('2026-08-15T10:00:00Z'))
    expect(outcome).toBe('dead_letter')

    const row = await db().job.findUniqueOrThrow({ where: { id: job.id } })
    expect(row.status).toBe('failed')
    expect(row.retryCount).toBe(row.maxRetries)
    expect(row.errorMessage).toContain(String(UNKNOWN_TYPE))
    // งาน dead letter ต้องไม่ถูกหยิบไปทำเองอีก (`91` §16)
    expect(await engine.runDueJobs({ organizationId: ORG_ID })).toMatchObject({ picked: 0 })
  })

  it('handler โยน error → เข้าคิวใหม่ตามเวลาถอย แล้วครบเพดานจึงเป็น dead letter', async () => {
    const registry = await import('@/lib/jobs/registry')
    const handlers = registry.JOB_HANDLERS as Record<string, unknown>
    const original = handlers['wht_summary']
    handlers['wht_summary'] = async () => {
      throw new Error('ปลายทางล่มระหว่างทดสอบ')
    }

    try {
      const { job } = await engine.enqueueJob({
        organizationId: ORG_ID,
        jobType: 'wht_summary',
        idempotencyKey: 'test53:retry-ladder',
        maxRetries: 2,
        createdBy: ADMIN_ID,
      })
      const now = new Date('2026-08-15T10:00:00Z')

      expect(await engine.runJob(job, now)).toBe('retry_scheduled')
      const afterFirst = await db().job.findUniqueOrThrow({ where: { id: job.id } })
      expect(afterFirst.status).toBe('pending')
      expect(afterFirst.retryCount).toBe(1)
      expect(afterFirst.errorMessage).toContain('ปลายทางล่ม')
      // ถอย 1 นาทีก่อนหยิบใหม่ ⇒ รอบที่ยิงทันทีต้องยังไม่หยิบงานนี้
      expect(afterFirst.scheduledAt?.toISOString()).toBe('2026-08-15T10:01:00.000Z')
      expect(await engine.runDueJobs({ now, organizationId: ORG_ID })).toMatchObject({ picked: 0 })

      const later = new Date('2026-08-15T10:02:00Z')
      expect(await engine.runDueJobs({ now: later, organizationId: ORG_ID })).toMatchObject({
        picked: 1,
        deadLettered: 1,
      })
      const afterSecond = await db().job.findUniqueOrThrow({ where: { id: job.id } })
      expect(afterSecond.status).toBe('failed')
      expect(afterSecond.retryCount).toBe(2)
      expect(afterSecond.completedAt).not.toBeNull()
    } finally {
      handlers['wht_summary'] = original
    }
  })

  it('งานค้าง `running` จากรอบที่ถูกตัดกลางคัน — ตัวกวาดดันกลับเข้าบันได retry', async () => {
    const { job } = await seedJob({ maxRetries: 2 })
    const startedAt = new Date('2026-08-15T10:00:00Z')
    await db().job.update({ where: { id: job.id }, data: { status: 'running', startedAt } })

    // ยังไม่ถึงเกณฑ์ค้าง = ห้ามไปแย่งงานที่อาจยังทำอยู่จริง
    expect(await engine.reclaimStaleJobs(new Date('2026-08-15T10:05:00Z'))).toBe(0)
    expect((await db().job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('running')

    const later = new Date('2026-08-15T10:30:00Z')
    expect(await engine.reclaimStaleJobs(later)).toBe(1)

    const reclaimed = await db().job.findUniqueOrThrow({ where: { id: job.id } })
    expect(reclaimed.status).toBe('pending')
    expect(reclaimed.retryCount).toBe(1)
    expect(reclaimed.errorMessage).toContain('ค้างสถานะ')
    // นับเป็นความล้มเหลวหนึ่งครั้ง ⇒ ค้างซ้ำจนครบเพดานต้องตกเป็น dead letter ไม่วนไม่รู้จบ
    await db().job.update({ where: { id: job.id }, data: { status: 'running', startedAt: later } })
    await engine.reclaimStaleJobs(new Date('2026-08-15T11:00:00Z'))
    const dead = await db().job.findUniqueOrThrow({ where: { id: job.id } })
    expect(dead.status).toBe('failed')
    expect(dead.retryCount).toBe(2)
  })
})

suite('สิทธิ์และการสั่งทำงานใหม่ (`91` §12/§14)', () => {
  it('Company User เปิดหน้า Job Log ไม่ได้เลย (403 ตั้งแต่ชั้นข้อมูล)', async () => {
    await expect(queries.listJobs(companyUser, baseQuery)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('เห็นงานขององค์กรตัวเอง + งานระดับระบบ แต่ไม่เห็นขององค์กรอื่น', async () => {
    const mine = await seedJob()
    const system = await engine.enqueueJob({
      organizationId: null,
      jobType: UNKNOWN_TYPE,
      idempotencyKey: 'test53:system-job',
    })
    const other = await engine.enqueueJob({
      organizationId: OTHER_ORG_ID,
      jobType: UNKNOWN_TYPE,
      idempotencyKey: 'test53:other-org',
      createdBy: OTHER_USER_ID,
    })

    const list = await queries.listJobs(executive, baseQuery)
    const ids = list.items.map((item) => item.id)
    expect(ids).toContain(mine.job.id)
    expect(ids).toContain(system.job.id)
    expect(ids).not.toContain(other.job.id)

    await expect(queries.getJob(executive, other.job.id)).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' })
  })

  it('ตัวกรองแยก "ล้มเหลว" กับ "ล้มเหลวถาวร" ตาม retry_count', async () => {
    const failing = await seedJob()
    const dead = await seedJob()
    await db().job.update({ where: { id: failing.job.id }, data: { status: 'failed', retryCount: 1, maxRetries: 3 } })
    await db().job.update({ where: { id: dead.job.id }, data: { status: 'failed', retryCount: 3, maxRetries: 3 } })

    const failed = await queries.listJobs(executive, { ...baseQuery, status: 'failed' })
    const deadLetter = await queries.listJobs(executive, { ...baseQuery, status: 'dead_letter' })

    expect(failed.items.map((item) => item.id)).toEqual([failing.job.id])
    expect(deadLetter.items.map((item) => item.id)).toEqual([dead.job.id])
    expect(deadLetter.items[0]?.status).toBe('dead_letter')
  })

  it('retry ได้เฉพาะ Superadmin — คนอื่นแม้ถือ manage ก็โดน 403', async () => {
    const { job } = await seedJob()
    await db().job.update({ where: { id: job.id }, data: { status: 'failed', retryCount: 3 } })

    await expect(
      queries.retryJob({ actor: sessionUser({ id: EXEC_ID }), meta }, job.id, { reason: 'ลองใหม่หน่อย' }),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('Superadmin สั่ง retry → กลับเข้าคิว รีเซ็ตรอบ retry และมี audit พร้อมเหตุผล', async () => {
    const { job } = await seedJob()
    await db().job.update({
      where: { id: job.id },
      data: { status: 'failed', retryCount: 3, errorMessage: 'ปลายทางล่ม', completedAt: new Date() },
    })

    const detail = await queries.retryJob({ actor: superadmin, meta }, job.id, {
      reason: 'ปลายทางกลับมาแล้ว จึงสั่งทำใหม่',
    })

    expect(detail.status).toBe('pending')
    expect(detail.retryCount).toBe(0)
    expect(detail.errorMessage).toBeNull()

    const audit = await db().auditLog.findFirst({
      where: { targetType: 'jobs', targetId: job.id, action: 'update' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.reason).toBe('ปลายทางกลับมาแล้ว จึงสั่งทำใหม่')
    expect(audit?.actorId).toBe(ADMIN_ID)
  })

  it('สั่ง retry งานที่ยังไม่ล้มเหลว = JOB_INVALID_STATUS', async () => {
    const { job } = await seedJob()
    await expect(
      queries.retryJob({ actor: superadmin, meta }, job.id, { reason: 'อยากลองใหม่' }),
    ).rejects.toMatchObject({ code: 'JOB_INVALID_STATUS' })
  })
})
