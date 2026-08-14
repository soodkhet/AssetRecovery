import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { isAuditError } from '@/lib/audit/errors'
import { auditLogImmutableExtension } from '@/lib/audit/immutable'

/**
 * เทสต์ระดับ DB จริง: `audit_logs` ต้อง reject UPDATE/DELETE/TRUNCATE ที่ระดับฐานข้อมูล
 * (`90` §16 "ลอง UPDATE/DELETE audit_logs โดยตรง → ต้อง reject ที่ระดับ backend ไม่ใช่แค่ UI" · `02` §13)
 *
 * ทำไมต้องมีชั้นนี้: guard ใน `lib/prisma.ts` กันได้เฉพาะทางที่ผ่าน Prisma Client — raw SQL, psql,
 * งาน ops หรือ service อื่นที่ต่อ DB เดียวกัน ยังลบทิ้งได้ถ้าไม่มี trigger
 *
 * รันเมื่อมี `TEST_DATABASE_URL` เท่านั้น (local: `assetrecovery_test` ใน docker-compose.dev · CI: postgres service)
 * และต้อง `pnpm db:deploy:test` มาก่อน — Rule 07 ห้ามยิง staging/production DB ในเทสต์เด็ดขาด
 */

const url = process.env.TEST_DATABASE_URL

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname)
  const isTestDb = parsed.pathname.includes('test')
  if (!isLocal || !isTestDb) {
    throw new Error(
      `TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น (host=${parsed.hostname} db=${parsed.pathname}) — Rule 07`,
    )
  }
}

const suite = url ? describe : describe.skip
if (!url) {
  console.warn('[audit-immutable.db.test] ข้ามเทสต์ระดับ DB — ไม่มี TEST_DATABASE_URL (ดู .env.example)')
}

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

afterAll(async () => {
  await client?.$disconnect()
})

/** UUID คงที่ ไม่มีอยู่จริงในตาราง — พิสูจน์ว่า trigger ยิงแม้คำสั่งไม่ match แถวไหนเลย */
const ABSENT_ID = '00000000-0000-0000-0000-0000000000ff'

suite('audit_logs immutable ระดับ DB (`02` §13 · `90` §16)', () => {
  it('มี trigger ครบทั้ง UPDATE / DELETE / TRUNCATE', async () => {
    const rows = await db().$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal
      ORDER BY tgname
    `
    expect(rows.map((row) => row.tgname)).toEqual([
      'trg_audit_logs_no_delete',
      'trg_audit_logs_no_truncate',
      'trg_audit_logs_no_update',
    ])
  })

  it('UPDATE ถูก reject แม้ไม่มีแถวที่ match (statement-level trigger)', async () => {
    await expect(
      db().$executeRawUnsafe(`UPDATE audit_logs SET reason = 'แก้ประวัติ' WHERE id = '${ABSENT_ID}'`),
    ).rejects.toThrow(/AUDIT_IMMUTABLE/)
  })

  it('DELETE ถูก reject แม้ไม่มีแถวที่ match', async () => {
    await expect(db().$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = '${ABSENT_ID}'`)).rejects.toThrow(
      /AUDIT_IMMUTABLE/,
    )
  })

  it('TRUNCATE ถูก reject (ทางลัดที่ row trigger จับไม่ได้)', async () => {
    await expect(db().$executeRawUnsafe('TRUNCATE TABLE audit_logs')).rejects.toThrow(/AUDIT_IMMUTABLE/)
  })

  it('INSERT ยังทำได้ปกติ และเก็บครบ 9 fields (rollback ทิ้งท้ายเทสต์ ไม่ทิ้งขยะใน DB)', async () => {
    const ROLLBACK = 'rollback-after-assert'
    const seen: Record<string, unknown>[] = []

    await expect(
      db().$transaction(async (tx) => {
        const orgId = '00000000-0000-0000-0000-0000000000aa'
        await tx.$executeRawUnsafe(`
          INSERT INTO organizations (id, name, tax_id, address)
          VALUES ('${orgId}', 'AuditImmutableTest', '9999999999999', 'ที่อยู่ทดสอบ')
        `)
        await tx.$executeRawUnsafe(`
          INSERT INTO audit_logs (organization_id, actor_id, actor_role, action, target_type, target_id,
                                  before_data, after_data, reason, ip_address, user_agent)
          VALUES ('${orgId}', NULL, 'Superadmin', 'update', 'expenses', '${ABSENT_ID}',
                  '{"amount_satang": 10050}', '{"amount_satang": 20000}', 'แก้ตามใบเสร็จจริง', '203.0.113.9', 'vitest')
        `)
        const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM audit_logs WHERE organization_id = '${orgId}'`,
        )
        seen.push(...rows)
        throw new Error(ROLLBACK)
      }),
    ).rejects.toThrow(ROLLBACK)

    expect(seen).toHaveLength(1)
    const row = seen[0] as Record<string, unknown>
    // 9 fields บังคับตาม `90` §13
    expect(row.actor_id).toBeNull()
    expect(row.actor_role).toBe('Superadmin')
    expect(row.action).toBe('update')
    expect(row.target_type).toBe('expenses')
    expect(row.target_id).toBe(ABSENT_ID)
    expect(row.before_data).toEqual({ amount_satang: 10050 })
    expect(row.after_data).toEqual({ amount_satang: 20000 })
    expect(row.reason).toBe('แก้ตามใบเสร็จจริง')
    expect(row.created_at).toBeInstanceOf(Date)
  })

  it('guard ระดับ service: prisma.auditLog.delete()/updateMany() ถูกปฏิเสธก่อนถึง DB', async () => {
    const guarded = db().$extends(auditLogImmutableExtension)

    await expect(guarded.auditLog.delete({ where: { id: ABSENT_ID } })).rejects.toSatisfy(isAuditError)
    await expect(guarded.auditLog.updateMany({ data: { reason: 'x' } })).rejects.toSatisfy(isAuditError)
    // อ่านยังได้ตามปกติ (`90` §14 GET /api/audit-logs)
    await expect(guarded.auditLog.count()).resolves.toBeGreaterThanOrEqual(0)
  })
})
