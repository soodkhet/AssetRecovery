import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import type * as FakeUploads from '@/tests/helpers/fake-uploads'
import { TINY_PNG } from '@/tests/helpers/letterhead'

vi.mock('@/lib/uploads/storage', async () => (await import('@/tests/helpers/fake-uploads')).fakeStorageModule())

/**
 * เทสต์ระดับ DB ของหน้า "ข้อมูลองค์กร" + หัวเอกสารกลาง (มติ PO 06/10/2569 U99)
 *
 *  · แก้ข้อมูล = บรรทัดที่อยู่ประกอบจาก 5 ช่อง · audit before/after เฉพาะฟิลด์ที่เปลี่ยน + เหตุผล
 *  · โลโก้: ตรวจจากเนื้อไฟล์ (PNG/JPG เท่านั้น · ≤ 1 MB · ต้องอยู่ใต้ prefix ขององค์กร · ต้องมีไฟล์จริง)
 *  · ลบโลโก้ = ปลดลิงก์ ไม่ลบไฟล์ใน Storage · หัวเอกสารโหลดโลโก้จาก Storage ฝั่ง server
 * Storage ใช้ตัวแทน (`tests/helpers/fake-uploads`) — ห้ามยิง Supabase จริง (Rule 07)
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

const ORG_ID = '00000000-0000-4000-8000-0000000099a0'
const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000099b0'
const ROLE_ID = '00000000-0000-4000-8000-0000000099a1'
const USER_ID = '00000000-0000-4000-8000-0000000099a2'
const TAX_ID = '9999999999910'

let client: PrismaClient | null = null
let queries: typeof import('@/lib/organization/queries')
let letterhead: typeof import('@/lib/organization/letterhead')
let uploads: typeof FakeUploads

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

const superadmin: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'uid-u99',
  email: 'superadmin-u99@test.local',
  fullName: 'Superadmin U99',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'Superadmin',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}

const meta = { ipAddress: null, userAgent: null }
const ctx = (reason: string) => ({ actor: superadmin, meta, reason })

const INPUT = {
  name: 'บริษัท ทดสอบหัวเอกสาร จำกัด',
  nameEn: 'Letterhead Test Co., Ltd.',
  taxId: TAX_ID,
  branchCode: '00000',
  addressDetail: '99/9 ถ.สุขุมวิท',
  addressSubdistrict: 'คลองเตยเหนือ',
  addressDistrict: 'วัฒนา',
  addressProvince: 'กรุงเทพมหานคร',
  addressPostalCode: '10110',
  phone: '02-111-2222',
  email: 'info@letterhead.test',
  website: 'www.letterhead.test',
  vatRegistered: true,
}

function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error)
}

async function lastAudit(): Promise<{ before_data: Record<string, unknown>; after_data: Record<string, unknown>; reason: string }> {
  const rows = await db().$queryRawUnsafe<
    { before_data: Record<string, unknown>; after_data: Record<string, unknown>; reason: string }[]
  >(`
    SELECT before_data, after_data, reason FROM audit_logs
    WHERE organization_id = '${ORG_ID}' AND target_type = 'organizations' AND target_id = '${ORG_ID}'
    ORDER BY created_at DESC LIMIT 1
  `)
  const row = rows[0]
  if (row === undefined) throw new Error('ไม่พบ audit')
  return row
}

const logoPath = (key: string, ext = 'png', org = ORG_ID) => `organization/${org}/logo/${key}.${ext}`

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  queries = await import('@/lib/organization/queries')
  letterhead = await import('@/lib/organization/letterhead')
  uploads = await import('@/tests/helpers/fake-uploads')

  await db().$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address, vat_registered)
    VALUES ('${ORG_ID}', 'U99 Org', '${TAX_ID}', '(รอกรอกที่อยู่จริงก่อน go-live)', true)
    ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'Superadmin U99', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'superadmin-u99@test.local', 'Superadmin U99', 'active')
    ON CONFLICT (id) DO NOTHING
  `)
})

beforeEach(async () => {
  if (!url) return
  uploads.resetFakeUploads()
  uploads.uploadTestState.realVerify = true
  // สถานะตั้งต้นของทุกเทสต์ = ค่าตัวอย่างจาก seed (รันซ้ำได้)
  await db().$executeRawUnsafe(`
    UPDATE organizations SET name = 'U99 Org', name_en = NULL, address = '(รอกรอกที่อยู่จริงก่อน go-live)',
      address_detail = NULL, address_subdistrict = NULL, address_district = NULL, address_province = NULL,
      address_postal_code = NULL, phone = NULL, email = NULL, website = NULL, logo_url = NULL, branch_code = '00000'
    WHERE id = '${ORG_ID}'
  `)
})

afterAll(async () => {
  await client?.$disconnect()
})

suite('มติ PO U99 — ข้อมูลองค์กร', () => {
  it('ค่าตัวอย่างของ seed ⇒ มีรายการเตือน · บันทึกข้อมูลจริงแล้วหาย · บรรทัดที่อยู่ประกอบจากช่อง', async () => {
    expect((await queries.getOrganizationProfile(ORG_ID)).issues.length).toBeGreaterThan(0)

    const saved = await queries.updateOrganizationProfile(ctx('กรอกข้อมูลจริงก่อนใช้งาน'), INPUT)
    expect(saved.issues).toEqual([])
    expect(saved.address).toBe('99/9 ถ.สุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110')
    expect(saved).toMatchObject({ nameEn: 'Letterhead Test Co., Ltd.', website: 'www.letterhead.test', branchLabel: 'สำนักงานใหญ่' })

    const audit = await lastAudit()
    expect(audit.reason).toBe('กรอกข้อมูลจริงก่อนใช้งาน')
    expect(audit.before_data).toMatchObject({ name: 'U99 Org', address: '(รอกรอกที่อยู่จริงก่อน go-live)' })
    expect(audit.after_data).toMatchObject({ name: INPUT.name, name_en: INPUT.nameEn, address_postal_code: '10110' })
    // เฉพาะฟิลด์ที่เปลี่ยน — เลขผู้เสียภาษีเท่าเดิมจึงไม่อยู่ใน diff
    expect(audit.after_data).not.toHaveProperty('tax_id')
  })

  it('โลโก้ PNG ≤ 1 MB ใต้ prefix ขององค์กร ⇒ ผูกได้ + audit (hash/ชนิด/ขนาด) + ตัวอย่างผ่าน signed URL', async () => {
    const path = logoPath('11111111-1111-4111-8111-000000000001')
    uploads.putFakeUpload(path, TINY_PNG)
    const profile = await queries.setOrganizationLogo(ctx('ใช้โลโก้บริษัทบนเอกสาร'), path)
    expect(profile.logoPath).toBe(path)
    expect(profile.logoPreviewUrl).toBe(`https://storage.test/signed/${path}`)
    const audit = await lastAudit()
    expect(audit.before_data).toMatchObject({ logo_url: null })
    expect(audit.after_data).toMatchObject({ logo_url: path, logo_mime_type: 'image/png', logo_size_bytes: TINY_PNG.length })
    expect(audit.reason).toBe('ใช้โลโก้บริษัทบนเอกสาร')

    // หัวเอกสารโหลดโลโก้จาก Storage ฝั่ง server แล้วฝังเป็นรูป
    const current = await letterhead.currentLetterhead(ORG_ID)
    expect(current.logo?.format).toBe('png')
    expect(current.logo?.data.length).toBe(TINY_PNG.length)
  })

  it.each([
    ['ไม่ใช่รูป PNG/JPG', () => uploads.sampleBytes('pdf'), 'UPLOAD_FILE_TYPE_INVALID', ORG_ID],
    ['ไฟล์เกิน 1 MB', () => new Uint8Array([...TINY_PNG, ...new Uint8Array(1024 * 1024)]), 'UPLOAD_FILE_TOO_LARGE', ORG_ID],
    ['path ขององค์กรอื่น', () => TINY_PNG, 'UPLOAD_PATH_OUT_OF_SCOPE', OTHER_ORG_ID],
  ])('%s ⇒ %s · ไม่บันทึก', async (_label, bytes, code, org) => {
    const path = logoPath(`11111111-1111-4111-8111-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`, 'png', org)
    uploads.putFakeUpload(path, bytes())
    await expect(queries.setOrganizationLogo(ctx('ทดสอบไฟล์โลโก้ผิด'), path)).rejects.toSatisfy(
      (error: unknown) => codeOf(error) === code,
    )
    expect((await queries.getOrganizationProfile(ORG_ID)).logoPath).toBeNull()
  })

  it('ไม่มีไฟล์จริงใน Storage ⇒ UPLOAD_FILE_NOT_FOUND', async () => {
    await expect(
      queries.setOrganizationLogo(ctx('ทดสอบไฟล์หาย'), logoPath('11111111-1111-4111-8111-000000000009')),
    ).rejects.toSatisfy((error: unknown) => codeOf(error) === 'UPLOAD_FILE_NOT_FOUND')
  })

  it('ลบโลโก้ = ปลดลิงก์ + audit · ไฟล์เดิมไม่ถูกลบ (เอกสารเก่าที่ snapshot path ไว้ยังพิมพ์ได้)', async () => {
    const path = logoPath('11111111-1111-4111-8111-000000000002', 'jpg')
    uploads.putFakeUpload(path, uploads.sampleBytes('jpeg'))
    await queries.setOrganizationLogo(ctx('ใช้โลโก้บริษัทบนเอกสาร'), path)

    const removed = await queries.removeOrganizationLogo(ctx('ไม่ใช้โลโก้บนเอกสารแล้ว'))
    expect(removed.logoPath).toBeNull()
    expect(removed.logoPreviewUrl).toBeNull()
    expect(await lastAudit()).toMatchObject({ before_data: { logo_url: path }, after_data: { logo_url: null } })
    expect(uploads.uploadTestState.removed).toEqual([])
    expect(uploads.uploadTestState.files.has(path)).toBe(true)

    // เอกสารเก่าที่ snapshot path เดิม ยังได้โลโก้เดิม · ค่าปัจจุบันไม่มีโลโก้แล้ว
    const resolver = letterhead.createLetterheadResolver(ORG_ID)
    expect((await resolver.current()).logo).toBeNull()
    const old = await resolver.forSnapshot(
      { name: 'ชื่อเดิม', taxId: TAX_ID, address: 'ที่อยู่เดิม', phone: null, branchCode: '00001' },
      { nameEn: 'Old Name', email: null, website: null, logoPath: path, logoSha256: null },
    )
    expect(old).toMatchObject({ nameTh: 'ชื่อเดิม', nameEn: 'Old Name', branchLabel: 'สาขาที่ 00001' })
    expect(old.logo?.format).toBe('jpg')
  })

  it('มติ PO U110: เอกสารก่อน U99 (ไม่มี snapshot ชุดเพิ่ม) ⇒ ชื่ออังกฤษ/อีเมล/เว็บไซต์/โลโก้ว่าง (ไม่ดึงค่าปัจจุบัน) · core ยังเป็น snapshot', async () => {
    await queries.updateOrganizationProfile(ctx('กรอกข้อมูลจริงก่อนใช้งาน'), INPUT)
    const legacy = await letterhead
      .createLetterheadResolver(ORG_ID)
      .forSnapshot({ name: 'ชื่อตอนออกใบ', taxId: '1111111111111', address: 'ที่อยู่ตอนออกใบ', phone: '02-0', branchCode: '00000' }, null)
    expect(legacy).toMatchObject({
      nameTh: 'ชื่อตอนออกใบ',
      taxId: '1111111111111',
      address: 'ที่อยู่ตอนออกใบ',
      nameEn: null,
      email: null,
      website: null,
      logo: null,
    })
  })

  it('มติ PO U110: อัปโหลดโลโก้เก็บ hash · snapshot hash ไม่ตรงไฟล์ ⇒ ไม่พิมพ์โลโก้ · ตรง ⇒ พิมพ์', async () => {
    const path = logoPath('11111111-1111-4111-8111-000000000004')
    uploads.putFakeUpload(path, TINY_PNG)
    await queries.setOrganizationLogo(ctx('ใช้โลโก้ใหม่'), path)
    const row = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { logoSha256: true } })
    expect(row.logoSha256).toMatch(/^[0-9a-f]{64}$/)
    const resolver = letterhead.createLetterheadResolver(ORG_ID)
    const core = { name: 'ก', taxId: TAX_ID, address: 'ที่อยู่', phone: null, branchCode: '00000' }
    const base = { nameEn: null, email: null, website: null, logoPath: path }
    expect((await resolver.forSnapshot(core, { ...base, logoSha256: row.logoSha256 })).logo?.format).toBe('png')
    expect((await resolver.forSnapshot(core, { ...base, logoSha256: 'f'.repeat(64) })).logo).toBeNull()
    await queries.removeOrganizationLogo(ctx('ไม่ใช้โลโก้แล้ว'))
    const cleared = await db().organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { logoSha256: true } })
    expect(cleared.logoSha256).toBeNull()
  })

  it('โลโก้เสีย/หาย ⇒ พิมพ์เอกสารได้โดยไม่มีโลโก้ (ไม่ล้ม)', async () => {
    const path = logoPath('11111111-1111-4111-8111-000000000003')
    await db().$executeRawUnsafe(`UPDATE organizations SET logo_url = '${path}' WHERE id = '${ORG_ID}'`)
    expect((await letterhead.currentLetterhead(ORG_ID)).logo).toBeNull()
    uploads.putFakeUpload(path, uploads.sampleBytes('text'))
    expect((await letterhead.currentLetterhead(ORG_ID)).logo).toBeNull()
  })
})
