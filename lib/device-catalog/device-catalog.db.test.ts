import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/types'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { TacSourceError, type TacDownloadResult, type TacSourceClient, type TacSourceCommit } from '@/lib/device-catalog/tac-source'

/**
 * เทสต์ระดับ DB ของแคตตาล็อก Model Phone + ฐาน TAC (มติ PO U155 → U159 · U162 · U166 → U168 · DEC-017)
 *
 *  · job `device_tac_sync` ทุกกิ่ง: นำเข้าครั้งแรก · commit sha เดิม = ไม่ดาวน์โหลด · commits API ล้ม = fallback ETag (304)
 *    · บังคับดึงใหม่ · เพิ่มเฉพาะ TAC ใหม่ (ไม่ทับที่จำ/ผูก/ซ่อน/ชื่อที่ผู้ดูแลแก้) · ล้ม = ประวัติ + แจ้งผู้ดูแล (outbox) + โยนต่อ
 *    · นำเข้าไฟล์เอง (ผ่าน/ผิดรูปแบบ)
 *  · การแสดง: ตัวกรอง (แบรนด์ในรายชื่อ + N ปี) · ตั้งด้วยมือชนะ · where ↔ pure ตรงกัน
 *  · เคส: IMEI → TAC → รุ่น · ระบบจำ learned (ไม่ทับ) · ผูก TAC เอง · นำเข้า CSV เติม/เตือนจาก TAC · ความจุ/สีบังคับก่อนส่งตรวจ
 * client ของแหล่งข้อมูลเป็น mock เสมอ — **ห้ามเรียกเน็ตจริง**
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
let job: typeof import('@/lib/device-catalog/tac-sync-job') | null = null
let tacQueries: typeof import('@/lib/device-catalog/tac-queries') | null = null
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

/** ไฟล์ TAC ตัวอย่าง (รูปแบบเดียวกับ `tac_full.csv` ของต้นทาง) */
const BASE_ROWS = [
  'SAMSUNG,35000001,"SAMSUNG GALAXY A55, Samsung SM-A556E/DS2024"',
  'SAMSUNG,35000002,"SAMSUNG GALAXY A55, Samsung SM-A556B2024"',
  'SAMSUNG,35000003,"SAMSUNG GALAXY TAB S9, Samsung SM-X716B2023"',
  'SAMSUNG,35000004,"SAMSUNG GALAXY S10, Samsung Galaxy S10, SM-G973F, 2019"',
  'APPLE,35000005,"APPLE IPHONE 16, Apple iPhone 16, A3287, 2024"',
  'APPLE,35000006,"APPLE IPAD AIR (2024), N/A, A2899, 2024"',
  'BLU,35000007,"BLU G93, BLU G0310WW2023"',
]

function csvOf(rows: readonly string[] = BASE_ROWS): string {
  return ['Brand,TAC,SPECS', ...rows].join('\n')
}

/** mock ของแหล่งข้อมูล — บันทึก ETag ที่ถูกส่งไปในแต่ละการดาวน์โหลด */
function mockSource(options: {
  commit?: TacSourceCommit | null
  csv?: string
  etag?: string
  notModifiedFor?: string
  failDownload?: Error
}): TacSourceClient & { downloads: Array<string | null>; commitCalls: number } {
  const state = { downloads: [] as Array<string | null>, commitCalls: 0 }
  return {
    get downloads() {
      return state.downloads
    },
    get commitCalls() {
      return state.commitCalls
    },
    async latestCommit() {
      state.commitCalls += 1
      return options.commit === undefined ? { sha: 'sha-1', committedAt: new Date('2026-09-01T00:00:00Z') } : options.commit
    },
    async download(etag: string | null): Promise<TacDownloadResult> {
      state.downloads.push(etag)
      if (options.failDownload !== undefined) throw options.failDownload
      if (options.notModifiedFor !== undefined && etag === options.notModifiedFor) return { status: 'not_modified' }
      return { status: 'ok', text: options.csv ?? csvOf(), etag: options.etag ?? '"etag-1"' }
    },
  }
}

async function runJob(csv = csvOf(), jobId = '00000000-0000-4000-8000-000000166001', sha = `sha-${jobId}`) {
  return loaded(job).runDeviceTacSyncJob({
    organizationId: ORG_ID,
    now: NOW,
    jobId,
    client: mockSource({ commit: { sha, committedAt: new Date('2026-09-01T00:00:00Z') }, csv }),
  })
}

async function model(name: string) {
  return db().deviceModel.findFirstOrThrow({ where: { organizationId: ORG_ID, name } })
}

async function cleanup(): Promise<void> {
  await db().$executeRawUnsafe(`DELETE FROM cases WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_tacs WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_tac_updates WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM notification_outbox WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_models WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_brands WHERE organization_id = '${ORG_ID}'`)
  await db().$executeRawUnsafe(`DELETE FROM device_catalog_settings WHERE organization_id = '${ORG_ID}'`)
}

beforeAll(async () => {
  if (!url) return
  process.env.DATABASE_URL = url
  job = await import('@/lib/device-catalog/tac-sync-job')
  tacQueries = await import('@/lib/device-catalog/tac-queries')
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
  // ผู้รับการแจ้งเตือน job ล้ม = ผู้ถือ manage_device_catalog (U167)
  await db().$executeRawUnsafe(`
    INSERT INTO role_capabilities (role_id, capability_id, access_level)
    SELECT '${ROLE_ID}', id, 'manage' FROM capabilities WHERE code = 'manage_device_catalog'
    ON CONFLICT DO NOTHING
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
  // ตัวกรองของเทสต์: Samsung + Apple · 5 ปี (2022 ขึ้นไป) — Blu ไม่อยู่ในรายชื่อ
  await db().deviceCatalogSettings.create({
    data: { organizationId: ORG_ID, brandNames: ['Samsung', 'Apple'], recentYears: 5 },
  })
})

afterAll(async () => {
  if (url) await cleanup()
  await client?.$disconnect()
})

suite('job device_tac_sync (มติ PO U166 → U168)', () => {
  it('นำเข้าครั้งแรก: แบรนด์/รุ่น/TAC ครบ · ไม่ตั้ง manual_status · จัดประเภท · ประวัติ + sha/ETag · audit ระบบ + job id', async () => {
    const result = await runJob()
    expect(result).toMatchObject({ status: 'success', path: 'downloaded', tacsAdded: 7, brandsAdded: 3, modelsAdded: 6 })
    expect(await db().deviceTac.count({ where: { organizationId: ORG_ID, source: 'tacdb' } })).toBe(7)
    const models = await db().deviceModel.findMany({ where: { organizationId: ORG_ID }, include: { brand: true } })
    expect(models.every((row) => row.manualStatus === null && row.source === 'tacdb')).toBe(true)
    expect(models.find((row) => row.name === 'Galaxy Tab S9')?.assetKind).toBe('tablet')
    expect(models.find((row) => row.name === 'iPad Air (2024)')?.assetKind).toBe('tablet')
    expect(models.find((row) => row.name === 'Galaxy S10')?.releaseYear).toBe(2019)
    const tac = await db().deviceTac.findFirstOrThrow({ where: { organizationId: ORG_ID, tac: '35000001' } })
    expect(tac).toMatchObject({ brandName: 'Samsung', modelName: 'Galaxy A55', variant: 'SM-A556E/DS', releaseYear: 2024 })
    expect(tac.deviceModelId).toBe((await model('Galaxy A55')).id)

    const history = await db().deviceTacUpdate.findMany({ where: { organizationId: ORG_ID } })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ trigger: 'daily', status: 'success', sourceSha: 'sha-00000000-0000-4000-8000-000000166001', tacsAdded: 7, modelsAdded: 6 })
    expect(history[0]?.addedModels).toEqual(expect.arrayContaining(['Samsung Galaxy A55', 'Blu G93']))
    const state = await db().deviceCatalogSettings.findUniqueOrThrow({ where: { organizationId: ORG_ID } })
    expect(state).toMatchObject({ tacSourceSha: 'sha-00000000-0000-4000-8000-000000166001', tacEtag: '"etag-1"' })
    const audit = await db().auditLog.findFirst({
      where: { organizationId: ORG_ID, targetType: 'device_tacs', actorId: null },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.reason).toContain('00000000-0000-4000-8000-000000166001')
  })

  it('commit sha เดิม = ไม่ดาวน์โหลด · บันทึก "ไม่มีของใหม่" + วันที่แก้ไฟล์บน GitHub', async () => {
    await runJob(csvOf(), '00000000-0000-4000-8000-000000166002', 'sha-same')
    const source = mockSource({ commit: { sha: 'sha-same', committedAt: new Date('2026-09-15T00:00:00Z') } })
    const result = await loaded(job).runDeviceTacSyncJob({ organizationId: ORG_ID, now: NOW, jobId: '00000000-0000-4000-8000-000000166003', client: source })
    expect(result).toMatchObject({ status: 'not_modified', path: 'sha_unchanged' })
    expect(source.downloads).toEqual([])
    const latest = await db().deviceTacUpdate.findFirstOrThrow({ where: { organizationId: ORG_ID, jobId: '00000000-0000-4000-8000-000000166003' } })
    expect(latest).toMatchObject({ status: 'not_modified', sourceSha: 'sha-same' })
    expect(latest.sourceUpdatedAt?.toISOString()).toBe('2026-09-15T00:00:00.000Z')
  })

  it('commits API ล้ม = fallback ETag: ส่ง If-None-Match · 304 = ไม่มีของใหม่ · บังคับดึงใหม่ = ไม่ส่ง ETag', async () => {
    await runJob()
    const fallback = mockSource({ commit: null, notModifiedFor: '"etag-1"' })
    const result = await loaded(job).runDeviceTacSyncJob({ organizationId: ORG_ID, now: NOW, jobId: '00000000-0000-4000-8000-000000166004', client: fallback })
    expect(fallback.downloads).toEqual(['"etag-1"'])
    expect(result).toMatchObject({ status: 'not_modified', path: 'etag_not_modified' })

    const forced = mockSource({ commit: { sha: 'sha-00000000-0000-4000-8000-000000166001', committedAt: NOW }, notModifiedFor: '"etag-1"' })
    const again = await loaded(job).runDeviceTacSyncJob({
      organizationId: ORG_ID,
      now: NOW,
      jobId: '00000000-0000-4000-8000-000000166005',
      trigger: 'manual',
      force: true,
      actor: { id: USER_ID, roleName: 'ธุรการ U155' },
      client: forced,
    })
    expect(forced.downloads).toEqual([null])
    expect(again).toMatchObject({ status: 'success', path: 'downloaded', tacsAdded: 0 })
    const row = await db().deviceTacUpdate.findFirstOrThrow({ where: { organizationId: ORG_ID, jobId: '00000000-0000-4000-8000-000000166005' } })
    expect(row).toMatchObject({ trigger: 'manual', createdBy: USER_ID })
  })

  it('เพิ่มเฉพาะ TAC ใหม่ · ไม่ทับแถวที่ระบบจำ/ผู้ดูแลผูก · ไม่เปิดรุ่นที่ซ่อน · ไม่ทับชื่อที่ผู้ดูแลแก้', async () => {
    await runJob()
    const q = loaded(queries)
    const a55 = await model('Galaxy A55')
    await q.updateDeviceModel(context, a55.id, { manualStatus: 'hidden', name: 'Galaxy A55 (ไทย)' })
    await db().deviceTac.update({
      where: { organizationId_tac: { organizationId: ORG_ID, tac: '35000005' } },
      data: { source: 'manual', modelName: 'iPhone 16 (ผูกเอง)' },
    })

    const result = await runJob(
      csvOf([...BASE_ROWS, 'SAMSUNG,35000008,"SAMSUNG GALAXY A55, Samsung SM-A556E2024"', 'APPLE,35000005,"APPLE IPHONE 17, N/A, A9999, 2025"']),
      '00000000-0000-4000-8000-000000166006',
    )
    expect(result.tacsAdded).toBe(1)
    expect(result.modelsAdded).toBe(0)
    const renamed = await db().deviceModel.findUniqueOrThrow({ where: { id: a55.id } })
    expect(renamed).toMatchObject({ manualStatus: 'hidden', name: 'Galaxy A55 (ไทย)' })
    const added = await db().deviceTac.findFirstOrThrow({ where: { organizationId: ORG_ID, tac: '35000008' } })
    expect(added.deviceModelId).toBe(a55.id)
    const kept = await db().deviceTac.findFirstOrThrow({ where: { organizationId: ORG_ID, tac: '35000005' } })
    expect(kept).toMatchObject({ source: 'manual', modelName: 'iPhone 16 (ผูกเอง)' })
  })

  it('ดาวน์โหลดล้ม = ประวัติ "ล้มเหลว" + สาเหตุ + แจ้งผู้ดูแล (outbox) แล้วโยนต่อให้ retry', async () => {
    const source = mockSource({ failDownload: new TacSourceError('ดาวน์โหลดไฟล์ TAC ไม่สำเร็จ (HTTP 503)', 503) })
    await expect(
      loaded(job).runDeviceTacSyncJob({ organizationId: ORG_ID, now: NOW, jobId: '00000000-0000-4000-8000-000000166007', client: source }),
    ).rejects.toBeInstanceOf(TacSourceError)
    const row = await db().deviceTacUpdate.findFirstOrThrow({ where: { organizationId: ORG_ID, jobId: '00000000-0000-4000-8000-000000166007' } })
    expect(row).toMatchObject({ status: 'failed', errorMessage: 'ดาวน์โหลดไฟล์ TAC ไม่สำเร็จ (HTTP 503)' })
    const outbox = await db().notificationOutbox.findMany({ where: { organizationId: ORG_ID } })
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.payload).toMatchObject({ kind: 'message', userId: USER_ID, eventCode: 'device_catalog.tac_update_failed' })
    expect(await db().deviceTac.count({ where: { organizationId: ORG_ID } })).toBe(0)
  })

  it('นำเข้าไฟล์เอง: สำเร็จ = trigger file · ไฟล์ผิดรูปแบบ = ล้มเหลว + ไม่แตะข้อมูล', async () => {
    const ok = await loaded(job).runDeviceTacSyncJob({
      organizationId: ORG_ID,
      now: NOW,
      jobId: '00000000-0000-4000-8000-000000166008',
      filePath: `organization/${ORG_ID}/device-tac/x.csv`,
      actor: { id: USER_ID, roleName: 'ธุรการ U155' },
      readFile: async () => new TextEncoder().encode(csvOf(BASE_ROWS.slice(0, 2))),
    })
    expect(ok).toMatchObject({ trigger: 'file', status: 'success', path: 'file', tacsAdded: 2 })

    await expect(
      loaded(job).runDeviceTacSyncJob({
        organizationId: ORG_ID,
        now: NOW,
        jobId: '00000000-0000-4000-8000-000000166009',
        filePath: `organization/${ORG_ID}/device-tac/y.csv`,
        actor: { id: USER_ID, roleName: 'ธุรการ U155' },
        readFile: async () => new TextEncoder().encode('a,b,c\n1,2,3'),
      }),
    ).rejects.toThrow('Brand,TAC,SPECS')
    const failed = await db().deviceTacUpdate.findFirstOrThrow({ where: { organizationId: ORG_ID, jobId: '00000000-0000-4000-8000-000000166009' } })
    expect(failed).toMatchObject({ trigger: 'file', status: 'failed' })
    expect(await db().deviceTac.count({ where: { organizationId: ORG_ID } })).toBe(2)
  })

  it('ประวัติ (U167): รอบอัปเดต + รายการที่ระบบจำ · ป้ายแหล่งข้อมูลหยุดอัปเดต', async () => {
    await runJob()
    const history = await loaded(tacQueries).getDeviceTacHistory(ORG_ID)
    expect(history.updates[0]).toMatchObject({ status: 'success', trigger: 'daily', actorName: null })
    const summary = await loaded(queries).getDeviceCatalogSummary(ORG_ID, NOW)
    // ไฟล์ต้นทางแก้ 01/09/2026 · ตอนนี้ 07/10/2026 (36 วัน) < 90 วัน
    expect(summary).toMatchObject({ tacCount: 7, sourceStale: false, staleAlertDays: 90 })
    expect(loaded(queries).isSourceStale(new Date('2026-01-01T00:00:00Z'), 90, NOW)).toBe(true)
    expect(loaded(queries).isSourceStale(null, 90, NOW)).toBe(false)
  })
})

suite('เคส: IMEI → TAC · ระบบจำ · ผูกเอง · นำเข้า · ความจุ/สี (มติ PO U166)', () => {
  let seq = 0
  const ref = (): string => {
    seq += 1
    return `U166-${seq}-${Date.now()}`
  }

  it('ค้น TAC จาก IMEI: พบ = ยี่ห้อ/รุ่น + รุ่นในแคตตาล็อก · ไม่พบ = found false', async () => {
    await runJob()
    const found = await loaded(tacQueries).lookupDeviceTac(ORG_ID, '350000011234567')
    expect(found).toMatchObject({ found: true, tac: '35000001', label: 'Samsung Galaxy A55', assetKind: 'smartphone' })
    expect(found.deviceModelId).toBe((await model('Galaxy A55')).id)
    const missing = await loaded(tacQueries).lookupDeviceTac(ORG_ID, '990000011234567')
    expect(missing).toMatchObject({ found: false, label: null })
  })

  it('รุ่นที่ซ่อนจากตัวเลือกแต่ IMEI ตรง TAC = ผูกรุ่นได้ (เครื่องจริงเป็นรุ่นนี้)', async () => {
    await runJob()
    const s10 = await model('Galaxy S10') // ออกปี 2019 ⇒ ไม่แสดงในตัวเลือก
    const created = await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetImeiSerial: '350000041234567',
        deviceModelId: s10.id,
      }),
      { actor, meta },
    )
    expect(created).toMatchObject({ deviceModelId: s10.id, assetBrandModel: 'Samsung Galaxy S10' })
  })

  it('TAC ที่ฐานไม่รู้จัก + เลือกรุ่น/พิมพ์เอง = ระบบจำ (learned + audit) · ไม่ทับแถวที่มีอยู่', async () => {
    await runJob()
    const a55 = await model('Galaxy A55')
    await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetImeiSerial: '86123456 000001 2',
        deviceModelId: a55.id,
      }),
      { actor, meta },
    )
    const learned = await db().deviceTac.findFirstOrThrow({ where: { organizationId: ORG_ID, tac: '86123456' } })
    expect(learned).toMatchObject({ source: 'learned', deviceModelId: a55.id, createdBy: USER_ID, modelName: 'Galaxy A55' })

    // ครั้งต่อไปเลือกอย่างอื่น = ไม่ทับที่จำไว้ · TAC จากฐาน = ไม่ถูกแทนด้วยที่ผู้ใช้พิมพ์
    await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetImeiSerial: '861234560000099',
        assetBrandModel: 'Vivo Y99',
      }),
      { actor, meta },
    )
    await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetImeiSerial: '350000011111111',
        assetBrandModel: 'Vivo Y99',
      }),
      { actor, meta },
    )
    expect((await db().deviceTac.findFirstOrThrow({ where: { organizationId: ORG_ID, tac: '86123456' } })).deviceModelId).toBe(a55.id)
    expect((await db().deviceTac.findFirstOrThrow({ where: { organizationId: ORG_ID, tac: '35000001' } })).source).toBe('tacdb')

    // พิมพ์เองกับ TAC ใหม่ = จำเป็นข้อความ (ไม่ผูกรุ่น)
    await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({
        caseRef: ref(),
        financeCompanyId: COMPANY_ID,
        assetType: 'smartphone',
        assetImeiSerial: '869999990000011',
        assetBrandModel: 'Vivo Y99',
      }),
      { actor, meta },
    )
    expect(await db().deviceTac.findFirstOrThrow({ where: { organizationId: ORG_ID, tac: '86999999' } })).toMatchObject({
      source: 'learned',
      brandName: 'vivo',
      modelName: 'Y99',
      deviceModelId: null,
    })
    const history = await loaded(tacQueries).getDeviceTacHistory(ORG_ID)
    expect(history.learned.map((row) => row.tac).sort()).toEqual(['86123456', '86999999'])
  })

  it('ผู้ดูแลผูก TAC เอง = แหล่ง manual (ทับได้ทุกแหล่ง) + audit', async () => {
    await runJob()
    const iphone = await model('iPhone 16')
    const saved = await loaded(tacQueries).bindDeviceTac(context, { tac: '35000001', deviceModelId: iphone.id, reason: 'ฐานผิด' })
    expect(saved).toMatchObject({ source: 'manual', brandName: 'Apple', modelName: 'iPhone 16', deviceModelId: iphone.id })
    const list = await loaded(tacQueries).listDeviceTacs(ORG_ID, { q: '3500000', source: 'manual', page: 1, pageSize: 50 })
    expect(list.items.map((row) => row.tac)).toEqual(['35000001'])
  })

  it('นำเข้า CSV: ยี่ห้อว่าง = เติมจาก TAC · ไม่ตรง = เตือน (คงข้อความในไฟล์) · ความจุ/สีจากไฟล์', async () => {
    await runJob()
    const first = ref()
    const second = ref()
    const input = loaded(caseSchemas).caseImportSchema.parse({
      financeCompanyId: COMPANY_ID,
      rows: [
        { เลขที่สัญญา: first, ประเภทสินค้า: 'มือถือ', 'IMEI / Serial': '350000011234567', ความจุ: '256 gb', สี: 'ดำ' },
        { เลขที่สัญญา: second, ประเภทสินค้า: 'มือถือ', 'IMEI / Serial': '350000051234567', 'ยี่ห้อ/รุ่น': 'OPPO A78' },
      ],
    })
    const result = await loaded(imports).importCases(input, { actor, meta })
    expect(result.createdCount).toBe(2)
    const byRow = new Map(result.rows.map((row) => [row.rowNumber, row]))
    expect([...byRow.values()][0]?.warnings?.assetBrandModel).toContain('เติมยี่ห้อ/รุ่นจาก IMEI')
    expect([...byRow.values()][1]?.warnings?.assetBrandModel).toContain('ไม่ตรงกับ IMEI')
    const rows = await db().case.findMany({ where: { organizationId: ORG_ID, caseRef: { in: [first, second] } } })
    const byRef = new Map(rows.map((row) => [row.caseRef, row]))
    expect(byRef.get(first)).toMatchObject({
      assetDescription: 'Samsung Galaxy A55',
      deviceModelId: (await model('Galaxy A55')).id,
      assetCapacity: '256GB',
      assetColor: 'ดำ',
    })
    expect(byRef.get(second)).toMatchObject({ assetDescription: 'OPPO A78' })
  })

  it('ความจุ/สีบังคับก่อนส่งตรวจ — "ไม่ระบุในสัญญา" นับว่าเลือกแล้ว · บันทึกเป็นข้อความ snapshot', async () => {
    const draft = await loaded(cases).createCase(
      loaded(caseSchemas).caseCreateSchema.parse({ caseRef: ref(), financeCompanyId: COMPANY_ID }),
      { actor, meta },
    )
    expect(draft.readiness.missingFields).toEqual(expect.arrayContaining(['assetCapacity', 'assetColor']))
    const updated = await loaded(cases).updateCase(
      actor,
      draft.id,
      { assetCapacity: 'ไม่ระบุในสัญญา', assetColor: 'ม่วงลาเวนเดอร์' },
      { actor, meta },
    )
    expect(updated).toMatchObject({ assetCapacity: 'ไม่ระบุในสัญญา', assetColor: 'ม่วงลาเวนเดอร์' })
    expect(updated.readiness.missingFields).not.toContain('assetCapacity')
    expect(updated.readiness.missingFields).not.toContain('assetColor')
  })
})

suite('การแสดงในตัวเลือก: ตัวกรอง + การตั้งด้วยมือ (มติ PO U159)', () => {
  async function optionNames(assetKind?: 'smartphone' | 'tablet', q = ''): Promise<string[]> {
    const options = await loaded(queries).searchDeviceModelOptions(ORG_ID, { assetKind, q, limit: 50 })
    return options.map((option) => option.label).sort()
  }

  it('ตั้งต้นตามตัวกรอง: แบรนด์ในรายชื่อ + รุ่นภายใน 5 ปี · กรองประเภท · ค้นหาหลายคำ', async () => {
    await runJob()
    expect(await optionNames()).toEqual(['Apple iPad Air (2024)', 'Apple iPhone 16', 'Samsung Galaxy A55', 'Samsung Galaxy Tab S9'])
    expect(await optionNames('tablet')).toEqual(['Apple iPad Air (2024)', 'Samsung Galaxy Tab S9'])
    expect(await optionNames(undefined, 'samsung a55')).toEqual(['Samsung Galaxy A55'])
  })

  it('ตั้งด้วยมือชนะตัวกรอง · ปิดแบรนด์ = ทุกรุ่นไม่แสดง · คืนค่า (null) = กลับไปตามตัวกรอง', async () => {
    await runJob()
    const q = loaded(queries)
    const s10 = await model('Galaxy S10')
    await q.bulkSetDeviceModelManualStatus(context, [s10.id], 'active')
    const blu = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'Blu' } })
    await q.updateDeviceBrand(context, blu.id, { manualStatus: 'active' })
    expect(await optionNames(undefined, 'galaxy s10')).toEqual(['Samsung Galaxy S10'])
    expect(await optionNames(undefined, 'g93')).toEqual(['Blu G93'])

    const apple = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'Apple' } })
    const iphone = await model('iPhone 16')
    await q.updateDeviceModel(context, iphone.id, { manualStatus: 'active' })
    await q.updateDeviceBrand(context, apple.id, { manualStatus: 'hidden' })
    expect(await optionNames(undefined, 'apple')).toEqual([])

    await q.updateDeviceBrand(context, apple.id, { manualStatus: null })
    expect(await optionNames(undefined, 'iphone')).toEqual(['Apple iPhone 16'])
  })

  it('เปลี่ยนตัวกรองแล้วมีผลทันที (ไม่ดึงข้อมูลใหม่) และไม่แตะค่าที่ตั้งด้วยมือ', async () => {
    await runJob()
    const a55 = await model('Galaxy A55')
    await loaded(queries).updateDeviceModel(context, a55.id, { manualStatus: 'hidden' })

    const current = await loaded(settings).getDeviceCatalogSettings(ORG_ID)
    await loaded(settings).updateDeviceCatalogSettings(context, current, { ...current, brandNames: ['Samsung', 'Blu'], recentYears: 10 })
    expect(await optionNames()).toEqual(['Blu G93', 'Samsung Galaxy S10', 'Samsung Galaxy Tab S9'])
    expect((await db().deviceModel.findUniqueOrThrow({ where: { id: a55.id } })).manualStatus).toBe('hidden')
  })

  it('where ของ DB ตรงกับ pure (isBrandVisible/isModelVisible) ทุกแถว', async () => {
    await runJob()
    const q = loaded(queries)
    const blu = await db().deviceBrand.findFirstOrThrow({ where: { organizationId: ORG_ID, name: 'Blu' } })
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
    await runJob()
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
    await runJob()
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
    await runJob()
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
    await runJob()
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
    await runJob()
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
    await runJob(csvOf(), '00000000-0000-4000-8000-000000166010')
    const afterJob = await db().deviceBrand.findMany({ where: { organizationId: ORG_ID } })
    expect(afterJob.every((brand) => brand.manualStatus === 'hidden')).toBe(true)
  })

  it('เลือกรุ่นทั้งหมดตามคำค้น + แบรนด์ + ประเภท: เปลี่ยนเฉพาะที่ตรง · กดซ้ำ = ไม่เปลี่ยน แต่ยังลง audit ของการกด', async () => {
    await runJob()
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
