import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * มติ D7-02 (mytester7 S7-AG7-05) — trigger ใน migration `20261019100000_authz_version` ต้องขยับเวอร์ชันสิทธิ์
 * ทุกครั้งที่ข้อมูลที่ session ใช้ตัดสินสิทธิ์เปลี่ยน แล้ว `readAuthzVersion()` (query ที่ทุก request ใช้) เห็นค่าใหม่
 * ⚠️ ต้องตั้ง `DATABASE_URL = TEST_DATABASE_URL` **ก่อน** import service · รัน `pnpm db:deploy:test` ก่อน
 */

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORG_ID = '00000000-0000-4000-8000-0000000d7020'

let prisma: typeof import('@/lib/prisma').prisma
let session: typeof import('@/lib/auth/session')

function assertLocalTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString)
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(parsed.hostname) || !parsed.pathname.includes('test')) {
    throw new Error('TEST_DATABASE_URL ต้องเป็น DB ทดสอบบนเครื่อง/CI เท่านั้น — Rule 07')
  }
}

beforeAll(async () => {
  if (!url) return
  assertLocalTestDatabase(url)
  process.env.DATABASE_URL = url
  prisma = (await import('@/lib/prisma')).prisma
  session = await import('@/lib/auth/session')
  await prisma.$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'D702Test', '9999999907020', 'ที่อยู่ทดสอบ D7-02') ON CONFLICT (id) DO NOTHING
  `)
})

afterAll(async () => {
  await prisma?.$disconnect()
})

async function fixture() {
  const tag = randomUUID().slice(0, 8)
  const role = await prisma.role.create({
    data: { organizationId: ORG_ID, name: `d702-${tag}`, roleGroup: 'inhouse', isEditable: true },
  })
  const otherRole = await prisma.role.create({
    data: { organizationId: ORG_ID, name: `d702-other-${tag}`, roleGroup: 'inhouse', isEditable: true },
  })
  const uid = randomUUID()
  const user = await prisma.user.create({
    data: { organizationId: ORG_ID, roleId: role.id, supabaseUid: uid, username: `d702.${tag}`, fullName: 'ทดสอบ D7-02' },
  })
  const capability = await prisma.capability.create({
    data: { code: `d702_cap_${tag}`, label: 'ทดสอบ', module: 'test' },
  })
  return { tag, role, otherRole, uid, user, capability }
}

suite('เวอร์ชันสิทธิ์ขยับด้วย trigger (มติ D7-02)', () => {
  it('ผู้ใช้: ระงับ/ย้ายทีม/เปลี่ยน role ⇒ users +1 · แก้ฟิลด์ที่ไม่เกี่ยวสิทธิ์ (เบอร์โทร) ⇒ ไม่ขยับ', async () => {
    const { uid, user, otherRole } = await fixture()
    const v0 = await session.readAuthzVersion(uid)
    await prisma.user.update({ where: { id: user.id }, data: { phone: '0800000000' } })
    expect(await session.readAuthzVersion(uid)).toEqual(v0)

    await prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } })
    const v1 = await session.readAuthzVersion(uid)
    expect(v1?.user).toBe((v0?.user ?? 0) + 1)

    await prisma.user.update({ where: { id: user.id }, data: { roleId: otherRole.id } })
    expect((await session.readAuthzVersion(uid))?.user).toBe((v1?.user ?? 0) + 1)
  })

  it('role_capabilities เพิ่ม/เปลี่ยนระดับ/ลบ ⇒ roles +1 ทุกครั้ง (กระทบผู้ใช้ทุกคนของ role)', async () => {
    const { uid, role, capability } = await fixture()
    const v0 = await session.readAuthzVersion(uid)
    await prisma.roleCapability.create({ data: { roleId: role.id, capabilityId: capability.id, accessLevel: 'manage' } })
    const v1 = await session.readAuthzVersion(uid)
    expect(v1?.role).toBe((v0?.role ?? 0) + 1)

    await prisma.roleCapability.update({
      where: { roleId_capabilityId: { roleId: role.id, capabilityId: capability.id } },
      data: { accessLevel: 'view' },
    })
    const v2 = await session.readAuthzVersion(uid)
    expect(v2?.role).toBe((v1?.role ?? 0) + 1)

    await prisma.roleCapability.deleteMany({ where: { roleId: role.id, capabilityId: capability.id } })
    expect((await session.readAuthzVersion(uid))?.role).toBe((v2?.role ?? 0) + 1)
    expect((await session.readAuthzVersion(uid))?.user).toBe(v0?.user)
  })

  it('team_managers / teams.supervisor_id ที่ผูกผู้ใช้เปลี่ยน ⇒ users +1', async () => {
    const { tag, uid, user } = await fixture()
    const team = await prisma.team.create({
      data: { organizationId: ORG_ID, name: `d702-team-${tag}`, side: 'inhouse', createdBy: user.id },
    })
    const v0 = await session.readAuthzVersion(uid)
    await prisma.teamManager.create({ data: { teamId: team.id, userId: user.id } })
    const v1 = await session.readAuthzVersion(uid)
    expect(v1?.user).toBe((v0?.user ?? 0) + 1)

    await prisma.teamManager.deleteMany({ where: { teamId: team.id, userId: user.id } })
    const v2 = await session.readAuthzVersion(uid)
    expect(v2?.user).toBe((v1?.user ?? 0) + 1)

    await prisma.team.update({ where: { id: team.id }, data: { supervisorId: user.id } })
    const v3 = await session.readAuthzVersion(uid)
    expect(v3?.user).toBe((v2?.user ?? 0) + 1)

    await prisma.team.update({ where: { id: team.id }, data: { provinces: ['เชียงใหม่'] } })
    expect(await session.readAuthzVersion(uid)).toEqual(v3)
  })

  it('loadSessionUser คืนเวอร์ชันเดียวกับ readAuthzVersion · uid ที่ไม่มี ⇒ null', async () => {
    const { uid } = await fixture()
    const loaded = await session.loadSessionUser(uid)
    expect(loaded?.authzVersion).toEqual(await session.readAuthzVersion(uid))
    expect(await session.readAuthzVersion(randomUUID())).toBeNull()
  })
})
