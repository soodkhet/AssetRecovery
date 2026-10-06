import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import {
  DeviceSpecsApiError,
  DeviceSpecsQuotaError,
  type DeviceSpecsClient,
  type RemoteModel,
} from '@/lib/device-catalog/rapidapi-client'

/**
 * เทสต์ระดับ DB ของแคตตาล็อก Model Phone (มติ PO U155 → U157 → U159 · DEC-016)
 *
 *  · job: ไม่มี key = ข้าม · ดึงครั้งแรก + รันซ้ำ idempotent · โควตาหมดกลางทาง = จบแบบสำเร็จ + resume รอบหน้า
 *    · ต้นทางล่ม (5xx) = โยนต่อให้ retry · **job ไม่เขียนทับการตั้งด้วยมือ/ชื่อที่ผู้ดูแลแก้**
 *  · การแสดง: ตัวกรอง (แบรนด์ในรายชื่อ + N ปี) · ตั้งด้วยมือชนะ · เปลี่ยนตัวกรองมีผลทันที · where ↔ pure ตรงกัน
 *  · เคส: เลือกจากรายการ = id + snapshot · รุ่นที่ไม่แสดงแล้ว = เก็บข้อความ ไม่บล็อก · นำเข้า CSV จับคู่ข้อความ
 * client ของ API เป็น mock เสมอ — **ห้ามเรียก API จริง**
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

const ORG_ID = '00000000-0000-4000-8000-000000155d00'
const ROLE_ID = '00000000-0000-4000-8000-000000155d01'
const USER_ID = '00000000-0000-4000-8000-000000155d02'
const COMPANY_ID = '00000000-0000-4000-8000-000000155d03'
const NOW = new Date('2026-10-07T05:00:00.000Z')

let client: PrismaClient | null = null
let job: typeof import('@/lib/device-catalog/sync-job') | null = null
let queries: typeof import('@/lib/device-catalog/queries') | null = null
let settings: typeof import('@/lib/device-catalog/settings-queries') | null = null
let catalog: typeof import('@/lib/device-catalog/catalog') | null = null
let cases: typeof import('@/lib/cases/queries') | null = null
let imports: typeof import('@/lib/cases/import-queries') | null = null
let caseSchemas: typeof import('@/lib/cases/schemas') | null = null

function db(): PrismaClient {
  if (!url) throw new Error('ไม่มี TEST_DATABASE_URL')
  if (!client) {
    assertLocalTestDatabase(url)
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}

function loaded<T>(value: T | null): T {
  if (value === null) throw new Error('ยังไม่ได้โหลดโมดูล')
  return value
}

const actor: SessionUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  supabaseUid: 'test-uid-u155',
  email: 'u155@test.local',
  fullName: 'ผู้ทดสอบ U155',
  status: 'active',
  roleId: ROLE_ID,
  roleName: 'ธุรการ U155',
  roleGroup: 'system',
  isSuperadmin: true,
  teamId: null,
  companyId: null,
  capabilities: {},
  scope: { kind: 'global', teamIds: [], companyId: null, userId: USER_ID },
  loginAt: new Date().toISOString(),
}
const meta = { ipAddress: null, userAgent: null }
const context = { actor, meta, reason: null }

/** fixture ของต้นทาง — แก้ได้ระหว่างเทสต์ */
interface Fixture {
  brands: string[]
  models: Record<string, RemoteModel[]>
  failModelsFor?: Record<string, Error>
  failBrands?: Error
}

function mockClient(fixture: Fixture): DeviceSpecsClient & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async listBrands() {
      calls.push('brands')
      if (fixture.failBrands !== undefined) throw fixture.failBrands
      return fixture.brands
    },
    async listModels(brand: string) {
      calls.push(`models:${brand}`)
      const failure = fixture.failModelsFor?.[brand]
      if (failure !== undefined) throw failure
      return fixture.models[brand] ?? []
    },
    quotaRemaining: () => null,
    requestCount: () => calls.length,
  }
}

const m = (name: string, releaseYear: number | null, externalId: string | null = null): RemoteModel => ({
  name,
  releaseYear,
  externalId,
})

function baseFixture(): Fixture {
  return {
    brands: ['Samsung', 'Apple', 'BLU'],
    models: {
      Samsung: [m('Samsung Galaxy A55', 2024, 'sa55'), m('Galaxy Tab S9', 2023, 'stabs9'), m('Galaxy S10', 2019, 'ss10')],
      Apple: [m('iPhone 16', 2024), m('iPad Air (2024)', 2024)],
      BLU: [m('G93', 2023)],
    },
  }
}

async function runJob(fixture: Fixture, maxRequests = 50, jobId = 'job-u155') {
  return loaded(job).runDeviceCatalogSyncJob({
    organizationId: ORG_ID,
    now: NOW,
    jobId,
    client: mockClient(fixture),
    maxRequests,
  })
}

async function model(name: string) {
  return db().deviceModel.findFirstOrThrow({ where: { organizationId: ORG_ID, name } })
}

async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_models WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_brands WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_catalog_settings WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  job = await import('@/lib/device-catalog/sync-job')
  queries = await import('@/lib/device-catalog/queries')
  settings = await import('@/lib/device-catalog/settings-queries')
  catalog = await import('@/lib/device-catalog/catalog')
  cases = await import('@/lib/cases/queries')
  imports = await import('@/lib/cases/import-queries')
  caseSchemas = await import('@/lib/cases/schemas')

  await db().$executeRawUnsafe(`
    INSERT INTO organizations (id, name, tax_id, address)
    VALUES ('${ORG_ID}', 'U155Catalog', '9999999155001', 'ที่อยู่ทดสอบ U155') ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO roles (id, organization_id, name, role_group, is_seed)
    VALUES ('${ROLE_ID}', '${ORG_ID}', 'ธุรการ U155', 'system', false) ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO users (id, organization_id, role_id, email, full_name, status)
    VALUES ('${USER_ID}', '${ORG_ID}', '${ROLE_ID}', 'u155@test.local', 'ธุรการ U155', 'active') ON CONFLICT (id) DO NOTHING
  `)
  await db().$executeRawUnsafe(`
    INSERT INTO finance_companies (id, organization_id, name, short_name, tax_id, vat_mode, created_by)
    VALUES ('${COMPANY_ID}', '${ORG_ID}', 'ไฟแนนซ์ U155', 'U155', '0105515500001', 'exclude_vat', '${USER_ID}')
    ON CONFLICT (id) DO NOTHING
  `)
  await cleanup()
})

beforeEach(async () => {
  if (!url) return
  await cleanup()
  // ตัวกรองของเทสต์: Samsung + Apple · 5 ปี (2022 ขึ้นไป) — BLU ไม่อยู่ในรายชื่อ
  await db().deviceCatalogSettings.create({
    data: { organizationId: ORG_ID, brandNames: ['Samsung', 'Apple'], recentYears: 5 },
  })
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

suite('job device_catalog_sync (มติ PO U155 → U159)', () => {
  it('ไม่มี key = ข้าม (สำเร็จ + เหตุผลใน Job Log) ไม่แตะข้อมูล', async () => {
    const result = await loaded(job).runDeviceCatalogSyncJob({ organizationId: ORG_ID, now: NOW, client: null })
    expect(result.skipped).toBe(true)
    expect(result.skipReason).toContain('RAPIDAPI_KEY')
    expect(await db().deviceBrand.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('ดึงครั้งแรก: เก็บทุกแบรนด์/ทุกรุ่น (ไม่กรอง) · จัดประเภท · ไม่ตั้ง manual_status · audit actor ระบบ + job id', async () => {
    const result = await runJob(baseFixture())
    expect(result).toMatchObject({ brandsCreated: 3, brandsSynced: 3, modelsCreated: 6, quotaExceeded: false, brandsPendingFirstSync: 0 })
    const rows = await db().deviceModel.findMany({ where: { organizationId: ORG_ID }, orderBy: { name: 'asc' } })
    expect(rows.map((row) => row.name)).toEqual(['G93', 'Galaxy A55', 'Galaxy S10', 'Galaxy Tab S9', 'iPad Air (2024)', 'iPhone 16'])
    expect(rows.every((row) => row.manualStatus === null && row.source === 'api')).toBe(true)
    expect((await model('Galaxy Tab S9')).assetKind).toBe('tablet')
    expect((await model('iPad Air (2024)')).assetKind).toBe('tablet')
    expect((await model('Galaxy A55')).assetKind).toBe('smartphone')
    // ไม่มีรหัสจากต้นทาง ⇒ ใช้ชื่อรุ่นฝั่งต้นทางเป็นรหัส
    expect((await model('iPhone 16')).externalId).toBe('iPhone 16')

    const audits = await db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetType: 'device_models', reason: { contains: 'job-u155' } },
    })
    expect(audits.length).toBeGreaterThan(0)
    expect(audits.every((audit) => audit.actorId === null)).toBe(true)
  })

  it('รันซ้ำ = idempotent (ไม่เกิดแถวซ้ำ) · รุ่นใหม่ของต้นทางถูกเพิ่ม', async () => {
    await runJob(baseFixture())
    const again = await runJob(baseFixture())
    expect(again).toMatchObject({ brandsCreated: 0, modelsCreated: 0, modelsUnchanged: 6 })

    const fixture = baseFixture()
    fixture.models['Samsung']?.push(m('Galaxy A56', 2025, 'sa56'))
    const third = await runJob(fixture)
    expect(third.modelsCreated).toBe(1)
    expect(await db().deviceModel.count({ where: { organizationId: ORG_ID } })).toBe(7)
  })

  it('job ไม่เขียนทับการตั้งด้วยมือ (แบรนด์/รุ่น) และชื่อที่ผู้ดูแลแก้', async () => {
    await runJob(baseFixture())
    const q = loaded(queries)
    const samsung = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'Samsung' } })
    const blu = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'BLU' } })
    await q.updateDeviceBrand(context, samsung.id, { manualStatus: 'hidden' })
    await q.updateDeviceBrand(context, blu.id, { manualStatus: 'active' })
    const a55 = await model('Galaxy A55')
    await q.updateDeviceModel(context, a55.id, { name: 'Galaxy A55 (TH)', manualStatus: 'hidden' })
    const iphone = await model('iPhone 16')
    await q.updateDeviceModel(context, iphone.id, { manualStatus: 'active' })

    await runJob(baseFixture(), 50, 'job-u155-2')

    expect((await db().deviceBrand.findUniqueOrThrow({ where: { id: samsung.id } })).manualStatus).toBe('hidden')
    expect((await db().deviceBrand.findUniqueOrThrow({ where: { id: blu.id } })).manualStatus).toBe('active')
    const after = await db().deviceModel.findUniqueOrThrow({ where: { id: a55.id } })
    expect(after.name).toBe('Galaxy A55 (TH)')
    expect(after.manualStatus).toBe('hidden')
    expect((await db().deviceModel.findUniqueOrThrow({ where: { id: iphone.id } })).manualStatus).toBe('active')
    // ไม่เกิดแถวซ้ำจากชื่อที่ถูกแก้ (จับคู่ด้วยรหัส)
    expect(await db().deviceModel.count({ where: { brandId: samsung.id } })).toBe(3)
  })

  it('โควตาหมดกลางทาง = จบแบบสำเร็จ + บันทึก · รอบหน้าดึงต่อจากแบรนด์ที่ค้าง (resume)', async () => {
    const fixture = baseFixture()
    // ลำดับดึงครั้งแรก (U162) = แบรนด์ในรายชื่อตลาดไทยตามลำดับรายชื่อ (Samsung → Apple) แล้วค่อยที่เหลือ (BLU)
    // ⇒ โควตาหมดที่ BLU
    fixture.failModelsFor = { BLU: new DeviceSpecsQuotaError('/models/BLU') }
    const firstClient = mockClient(fixture)
    const first = await loaded(job).runDeviceCatalogSyncJob({ organizationId: ORG_ID, now: NOW, client: firstClient, maxRequests: 50 })
    expect(firstClient.calls).toEqual(['brands', 'models:Samsung', 'models:Apple', 'models:BLU'])
    expect(first.quotaExceeded).toBe(true)
    expect(first.brandsPendingFirstSync).toBe(1)
    expect(await db().deviceModel.count({ where: { organizationId: ORG_ID } })).toBe(5)

    const resumed = mockClient(baseFixture())
    const second = await loaded(job).runDeviceCatalogSyncJob({ organizationId: ORG_ID, now: NOW, client: resumed, maxRequests: 2 })
    // งบ 2 request = brands + แบรนด์ที่ค้าง 1 ตัว (ยังไม่เคยดึงมาก่อนเสมอ — ไม่วนกลับไปดึงแบรนด์ไทยที่ดึงแล้ว)
    expect(resumed.calls).toEqual(['brands', 'models:BLU'])
    expect(second).toMatchObject({ quotaExceeded: false, brandsPendingFirstSync: 0, modelsCreated: 1 })
  })

  it('โควตาหมดตั้งแต่ดึงรายชื่อแบรนด์ = ข้าม ไม่แตะข้อมูลเดิม', async () => {
    await runJob(baseFixture())
    const fixture = baseFixture()
    fixture.failBrands = new DeviceSpecsQuotaError('/brands')
    const result = await runJob(fixture)
    expect(result.quotaExceeded).toBe(true)
    expect(await db().deviceModel.count({ where: { organizationId: ORG_ID } })).toBe(6)
  })

  it('ต้นทางล่ม (5xx) = โยน error ให้ตัวรันงาน retry · ของที่ดึงแล้วคงอยู่', async () => {
    const fixture = baseFixture()
    // ลำดับดึง (U162): Samsung → Apple (รายชื่อตลาดไทย) → BLU ⇒ ล่มที่ BLU หลังดึง 2 แบรนด์แรกแล้ว
    fixture.failModelsFor = { BLU: new DeviceSpecsApiError('down', 503) }
    await expect(runJob(fixture)).rejects.toBeInstanceOf(DeviceSpecsApiError)
    expect(await db().deviceModel.count({ where: { organizationId: ORG_ID } })).toBe(5)
  })
})

suite('การแสดงในตัวเลือก: ตัวกรอง + การตั้งด้วยมือ (มติ PO U159)', () => {
  async function optionNames(assetKind?: 'smartphone' | 'tablet', q = ''): Promise<string[]> {
    const options = await loaded(queries).searchDeviceModelOptions(ORG_ID, { assetKind, q, limit: 50 })
    return options.map((option) => option.label).sort()
  }

  it('ตั้งต้นตามตัวกรอง: แบรนด์ในรายชื่อ + รุ่นภายใน 5 ปี · กรองประเภท · ค้นหาหลายคำ', async () => {
    await runJob(baseFixture())
    expect(await optionNames()).toEqual(['Apple iPad Air (2024)', 'Apple iPhone 16', 'Samsung Galaxy A55', 'Samsung Galaxy Tab S9'])
    expect(await optionNames('tablet')).toEqual(['Apple iPad Air (2024)', 'Samsung Galaxy Tab S9'])
    expect(await optionNames(undefined, 'samsung a55')).toEqual(['Samsung Galaxy A55'])
  })

  it('ตั้งด้วยมือชนะตัวกรอง · ปิดแบรนด์ = ทุกรุ่นไม่แสดง · คืนค่า (null) = กลับไปตามตัวกรอง', async () => {
    await runJob(baseFixture())
    const q = loaded(queries)
    const s10 = await model('Galaxy S10')
    await q.bulkSetDeviceModelManualStatus(context, [s10.id], 'active')
    const blu = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'BLU' } })
    await q.updateDeviceBrand(context, blu.id, { manualStatus: 'active' })
    expect(await optionNames(undefined, 'galaxy s10')).toEqual(['Samsung Galaxy S10'])
    expect(await optionNames(undefined, 'g93')).toEqual(['BLU G93'])

    const apple = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'Apple' } })
    const iphone = await model('iPhone 16')
    await q.updateDeviceModel(context, iphone.id, { manualStatus: 'active' })
    await q.updateDeviceBrand(context, apple.id, { manualStatus: 'hidden' })
    expect(await optionNames(undefined, 'apple')).toEqual([])

    await q.updateDeviceBrand(context, apple.id, { manualStatus: null })
    expect(await optionNames(undefined, 'iphone')).toEqual(['Apple iPhone 16'])
  })

  it('เปลี่ยนตัวกรองแล้วมีผลทันที (ไม่ดึง API) และไม่แตะค่าที่ตั้งด้วยมือ', async () => {
    await runJob(baseFixture())
    const a55 = await model('Galaxy A55')
    await loaded(queries).updateDeviceModel(context, a55.id, { manualStatus: 'hidden' })

    const current = await loaded(settings).getDeviceCatalogSettings(ORG_ID)
    await loaded(settings).updateDeviceCatalogSettings(context, current, { brandNames: ['Samsung', 'BLU'], recentYears: 10 })
    expect(await optionNames()).toEqual(['BLU G93', 'Samsung Galaxy S10', 'Samsung Galaxy Tab S9'])
    expect((await db().deviceModel.findUniqueOrThrow({ where: { id: a55.id } })).manualStatus).toBe('hidden')
  })

  it('where ของ DB ตรงกับ pure (isBrandVisible/isModelVisible) ทุกแถว', async () => {
    await runJob(baseFixture())
    const q = loaded(queries)
    const blu = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'BLU' } })
    await q.updateDeviceBrand(context, blu.id, { manualStatus: 'active' })
    await q.updateDeviceModel(context, (await model('Galaxy S10')).id, { manualStatus: 'active' })
    await q.updateDeviceModel(context, (await model('iPhone 16')).id, { manualStatus: 'hidden' })

    const c = loaded(catalog)
    const filter = await loaded(settings).getCatalogFilter(ORG_ID, NOW)
    const rows = await db().deviceModel.findMany({ where: { organizationId: ORG_ID }, include: { brand: true } })
    const expected = rows
      .filter((row) => c.isModelVisible(row, c.isBrandVisible(row.brand, filter), filter))
      .map((row) => row.id)
      .sort()
    const visible = await db().deviceModel.findMany({
      where: { organizationId: ORG_ID, ...q.modelVisibleWhere(filter) },
      select: { id: true },
    })
    const hidden = await db().deviceModel.findMany({
      where: { organizationId: ORG_ID, ...q.modelHiddenWhere(filter) },
      select: { id: true },
    })
    expect(visible.map((row) => row.id).sort()).toEqual(expected)
    expect(visible.length + hidden.length).toBe(rows.length)
  })

  it('เพิ่มแบรนด์/รุ่นเอง = แสดงทันที (ตั้งด้วยมือ) · ชื่อซ้ำ = DUPLICATE_DEVICE_CATALOG_ITEM', async () => {
    const q = loaded(queries)
    const brand = await q.createManualDeviceBrand(context, { name: 'Wiko' })
    await q.createManualDeviceModel(context, { brandId: brand.id, assetKind: 'smartphone', name: 'View 5', releaseYear: 2015 })
    expect(await optionNames(undefined, 'wiko')).toEqual(['Wiko View 5'])
    await expect(q.createManualDeviceBrand(context, { name: ' WIKO ' })).rejects.toMatchObject({ code: 'DUPLICATE_DEVICE_CATALOG_ITEM' })
    await expect(
      q.createManualDeviceModel(context, { brandId: brand.id, assetKind: 'smartphone', name: 'view-5' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_DEVICE_CATALOG_ITEM' })
  })
})

suite('เคส: เลือกจากรายการ / ระบุเอง / นำเข้า (มติ PO U155)', () => {
  let seq = 0
  const ref = (): string => {
    seq += 1
    return `U155-${seq}-${Date.now()}`
  }

  it('เลือกจากรายการ = เก็บ id + ข้อความ snapshot จากแคตตาล็อก', async () => {
    await runJob(baseFixture())
    const a55 = await model('Galaxy A55')
    const created = await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetBrandModel: 'อะไรก็ได้',
        deviceModelId: a55.id,
      }),
      { actor, meta },
    )
    expect(created.deviceModelId).toBe(a55.id)
    expect(created.assetBrandModel).toBe('Samsung Galaxy A55')
  })

  it('รุ่นที่ไม่แสดงแล้ว/ประเภทไม่ตรง = ไม่บล็อก — เก็บข้อความที่ส่งมา ไม่อ้างรุ่น · ระบุเองได้เสมอ', async () => {
    await runJob(baseFixture())
    const s10 = await model('Galaxy S10') // เก่ากว่า 5 ปี ⇒ ไม่แสดง
    const hidden = await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetBrandModel: 'Samsung S10 สีดำ',
        deviceModelId: s10.id,
      }),
      { actor, meta },
    )
    expect(hidden.deviceModelId).toBeNull()
    expect(hidden.assetBrandModel).toBe('Samsung S10 สีดำ')

    const tab = await model('Galaxy Tab S9')
    const mismatch = await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetBrandModel: 'Tab S9',
        deviceModelId: tab.id,
      }),
      { actor, meta },
    )
    expect(mismatch.deviceModelId).toBeNull()

    const manual = await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetBrandModel: 'ยี่ห้อแปลก รุ่นพิเศษ',
        deviceModelId: null,
      }),
      { actor, meta },
    )
    expect(manual).toMatchObject({ deviceModelId: null, assetBrandModel: 'ยี่ห้อแปลก รุ่นพิเศษ' })
  })

  it('แก้เคส: ส่งข้อความเดิมโดยไม่ระบุรุ่น = คงรุ่นเดิม · ส่งข้อความใหม่ = ปลดรุ่น', async () => {
    await runJob(baseFixture())
    const a55 = await model('Galaxy A55')
    const created = await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        deviceModelId: a55.id,
      }),
      { actor, meta },
    )
    const same = await loaded(cases).updateCase(actor, created.id, { assetBrandModel: 'Samsung Galaxy A55' }, { actor, meta })
    expect(same.deviceModelId).toBe(a55.id)
    const changed = await loaded(cases).updateCase(actor, created.id, { assetBrandModel: 'เครื่องอื่น' }, { actor, meta })
    expect(changed).toMatchObject({ deviceModelId: null, assetBrandModel: 'เครื่องอื่น' })
  })

  it('นำเข้า CSV: จับคู่ข้อความแบบไม่สนตัวพิมพ์/ช่องว่าง · ไม่เจอ = เก็บข้อความเดิม', async () => {
    await runJob(baseFixture())
    const a55 = await model('Galaxy A55')
    const first = ref()
    const second = ref()
    const input = loaded(caseSchemas).caseImportSchema.parse({
      financeCompanyId: COMPANY_ID,
      rows: [
        { เลขที่สัญญา: first, ประเภทสินค้า: 'มือถือ', 'ยี่ห้อ/รุ่น': 'SAMSUNG galaxy-a55' },
        { เลขที่สัญญา: second, ประเภทสินค้า: 'มือถือ', 'ยี่ห้อ/รุ่น': 'Nokia 3310 เก่ามาก' },
      ],
    })
    const result = await loaded(imports).importCases(input, { actor, meta })
    expect(result.createdCount).toBe(2)
    const rows = await db().case.findMany({ where: { organizationId: ORG_ID, caseRef: { in: [first, second] } } })
    const byRef = new Map(rows.map((row) => [row.caseRef, row]))
    expect(byRef.get(first)).toMatchObject({ deviceModelId: a55.id, assetDescription: 'Samsung Galaxy A55' })
    expect(byRef.get(second)).toMatchObject({ deviceModelId: null, assetDescription: 'Nokia 3310 เก่ามาก' })
  })
})

suite('เลือกทั้งหมด / ไม่เลือกทั้งหมด (มติ PO U162)', () => {
  async function bulkAudits(targetType: string) {
    return db().auditLog.findMany({
      where: { organizationId: ORG_ID, targetType, targetId: null, actorId: USER_ID },
      orderBy: { createdAt: 'asc' },
    })
  }

  it('ไม่เลือกแบรนด์ทั้งหมด: ทั้งชุดที่ตรงเงื่อนไข (ไม่ใช่แค่หน้าที่เห็น) · audit 1 แถวต่อการกด · job ไม่เขียนทับ', async () => {
    await runJob(baseFixture())
    const before = await bulkAudits('device_brands')
    const result = await loaded(queries).bulkSetDeviceCatalogVisibility(context, {
      target: 'brands',
      manualStatus: 'hidden',
      visibility: 'all',
      q: undefined,
      reason: 'ปิดทุกแบรนด์ก่อนเลือกใหม่',
    })
    expect(result).toEqual({ updated: 3, unchanged: 0 })
    const brands = await db().deviceBrand.findMany({ where: { organizationId: ORG_ID } })
    expect(brands.every((brand) => brand.manualStatus === 'hidden')).toBe(true)
    expect(await loaded(queries).searchDeviceModelOptions(ORG_ID, { q: '', limit: 50 })).toEqual([])

    const audits = (await bulkAudits('device_brands')).slice(before.length)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.reason).toBe('ปิดทุกแบรนด์ก่อนเลือกใหม่')
    expect(audits[0]?.afterData).toMatchObject({
      bulk: true,
      manual_status: 'hidden',
      criteria: { visibility: 'all', q: null },
      matched: 3,
      updated: 3,
      unchanged: 0,
    })

    // ค่าที่ตั้ง = การตั้งด้วยมือ ⇒ job รอบถัดไปไม่เขียนทับ
    await runJob(baseFixture(), 50, 'job-u162')
    const afterJob = await db().deviceBrand.findMany({ where: { organizationId: ORG_ID } })
    expect(afterJob.every((brand) => brand.manualStatus === 'hidden')).toBe(true)
  })

  it('เลือกรุ่นทั้งหมดตามคำค้น + แบรนด์ + ประเภท: เปลี่ยนเฉพาะที่ตรง · กดซ้ำ = ไม่เปลี่ยน แต่ยังลง audit ของการกด', async () => {
    await runJob(baseFixture())
    const samsung = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'Samsung' } })
    const input = {
      target: 'models' as const,
      manualStatus: 'active' as const,
      visibility: 'all' as const,
      assetKind: 'smartphone' as const,
      brandId: samsung.id,
      q: 'galaxy',
      reason: 'เปิดมือถือ Samsung ทุกรุ่น',
    }
    const first = await loaded(queries).bulkSetDeviceCatalogVisibility(context, input)
    // Galaxy A55 + Galaxy S10 (Galaxy Tab S9 เป็นแท็บเล็ต — ไม่ตรงเงื่อนไข)
    expect(first).toEqual({ updated: 2, unchanged: 0 })
    expect((await model('Galaxy S10')).manualStatus).toBe('active')
    expect((await model('Galaxy Tab S9')).manualStatus).toBeNull()
    expect((await model('iPhone 16')).manualStatus).toBeNull()

    const second = await loaded(queries).bulkSetDeviceCatalogVisibility(context, input)
    expect(second).toEqual({ updated: 0, unchanged: 2 })
    const audits = await bulkAudits('device_models')
    expect(audits.slice(-2).map((audit) => (audit.afterData as { updated: number }).updated)).toEqual([2, 0])
  })
})
