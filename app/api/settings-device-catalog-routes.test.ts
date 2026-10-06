import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของ Model Phone (มติ PO U155 → U159) — ใช้ `requirePermission()` ตัวจริง (mock session + ชั้นข้อมูล)
 *
 *  · หน้าผู้ดูแล = `manage_device_catalog` (ธุรการ manage · บริหาร view · Superadmin โดยนิยาม)
 *  · บริหาร (view) อ่านได้ แก้ไม่ได้ · การเงินไม่มีสิทธิ์ = 403 · ไม่แตะชั้นข้อมูลเมื่อถูกปฏิเสธ
 *  · ตัวเลือกในฟอร์มรับเคส = ผู้สร้าง/แก้เคส (`record_admin_data` ฯลฯ) หรือผู้ดูแลแคตตาล็อก
 *  · (U166/U167) "อัปเดตตอนนี้"/"นำเข้าไฟล์เอง"/TAC/ประวัติ = ผู้ดูแล · ค้น TAC จาก IMEI = ผู้สร้างเคส
 *    — **ไม่รันงานจริง/ไม่เรียกเน็ต/ไม่แตะ storage จริง** (mock ชั้นข้อมูล + storage)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getDeviceCatalogSummary: vi.fn(),
  listDeviceBrands: vi.fn(),
  listDeviceModels: vi.fn(),
  createManualDeviceBrand: vi.fn(),
  updateDeviceBrand: vi.fn(),
  createManualDeviceModel: vi.fn(),
  updateDeviceModel: vi.fn(),
  bulkSetDeviceModelManualStatus: vi.fn(),
  bulkSetDeviceCatalogVisibility: vi.fn(),
  searchDeviceModelOptions: vi.fn(),
}))
vi.mock('@/lib/device-catalog/queries', () => queriesMock)

const settingsMock = vi.hoisted(() => ({
  getDeviceCatalogSettings: vi.fn(),
  updateDeviceCatalogSettings: vi.fn(),
}))
vi.mock('@/lib/device-catalog/settings-queries', () => settingsMock)

const tacMock = vi.hoisted(() => ({
  requestDeviceTacUpdate: vi.fn(),
  listDeviceTacs: vi.fn(),
  bindDeviceTac: vi.fn(),
  getDeviceTacHistory: vi.fn(),
  lookupDeviceTac: vi.fn(),
  isOwnTacFilePath: (organizationId: string, path: string) => path.startsWith(`organization/${organizationId}/device-tac/`),
}))
vi.mock('@/lib/device-catalog/tac-queries', () => tacMock)

const storageMock = vi.hoisted(() => ({ downloadUploadedFile: vi.fn() }))
vi.mock('@/lib/uploads/storage', () => storageMock)

const engineMock = vi.hoisted(() => ({ enqueueJob: vi.fn(), runJobById: vi.fn() }))
vi.mock('@/lib/jobs/engine', () => engineMock)
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: vi.fn() }))

const summaryRoute = await import('@/app/api/settings/device-catalog/route')
const settingsRoute = await import('@/app/api/settings/device-catalog/settings/route')
const brandsRoute = await import('@/app/api/settings/device-catalog/brands/route')
const brandRoute = await import('@/app/api/settings/device-catalog/brands/[id]/route')
const modelsRoute = await import('@/app/api/settings/device-catalog/models/route')
const statusRoute = await import('@/app/api/settings/device-catalog/models/status/route')
const tacUpdateRoute = await import('@/app/api/settings/device-catalog/tac-update/route')
const tacImportRoute = await import('@/app/api/settings/device-catalog/tac-import/route')
const tacsRoute = await import('@/app/api/settings/device-catalog/tacs/route')
const tacHistoryRoute = await import('@/app/api/settings/device-catalog/tac-history/route')
const tacLookupRoute = await import('@/app/api/device-catalog/tac-lookup/route')
const attributesRoute = await import('@/app/api/device-catalog/attributes/route')
const bulkRoute = await import('@/app/api/settings/device-catalog/bulk-visibility/route')
const optionsRoute = await import('@/app/api/device-catalog/options/route')

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'user@example.com',
    fullName: 'ผู้ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ธุรการ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities: {},
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
    ...overrides,
  }
}

const ADMIN_OFFICE = sessionUser({ capabilities: { manage_device_catalog: 'manage', record_admin_data: 'manage' } })
const EXECUTIVE = sessionUser({ id: 'exec-1', roleName: 'บริหาร', capabilities: { manage_device_catalog: 'view' } })
const FINANCE = sessionUser({ id: 'fin-1', roleName: 'การเงิน', capabilities: { view_master_data: 'view' } })
const CASE_CLERK = sessionUser({ id: 'clerk-1', capabilities: { record_admin_data: 'manage' } })
const FIELD_AGENT = sessionUser({ id: 'agent-1', roleName: 'พนักงานภาคสนาม', roleGroup: 'inhouse', capabilities: {} })

const BRAND_ID = '11111111-1111-4111-8111-111111111111'
const MODEL_ID = '22222222-2222-4222-8222-222222222222'

function request(method: string, path: string, body?: unknown): NextRequest {
  const url = `http://localhost${path}`
  const base = new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const mock of [...Object.values(queriesMock), ...Object.values(settingsMock), ...Object.values(engineMock)]) mock.mockReset()
  for (const mock of [tacMock.requestDeviceTacUpdate, tacMock.listDeviceTacs, tacMock.bindDeviceTac, tacMock.getDeviceTacHistory, tacMock.lookupDeviceTac, storageMock.downloadUploadedFile]) mock.mockReset()
  queriesMock.getDeviceCatalogSummary.mockResolvedValue({ brandCount: 0 })
  queriesMock.listDeviceBrands.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
  queriesMock.listDeviceModels.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
  queriesMock.updateDeviceBrand.mockResolvedValue({ id: BRAND_ID, name: 'Samsung', manualStatus: 'hidden' })
  queriesMock.bulkSetDeviceModelManualStatus.mockResolvedValue({ updated: 1, unchanged: 0 })
  queriesMock.searchDeviceModelOptions.mockResolvedValue([])
  settingsMock.getDeviceCatalogSettings.mockResolvedValue({ brandNames: ['Samsung'], recentYears: 5, updatedAt: null })
  settingsMock.updateDeviceCatalogSettings.mockImplementation(async (_context, _current, values) => ({ ...values, updatedAt: 'x' }))
  engineMock.enqueueJob.mockResolvedValue({ job: { id: 'job-1' }, duplicate: false })
})

describe('หน้า Model Phone — สิทธิ์ manage_device_catalog', () => {
  it('ธุรการ (manage) อ่าน/แก้ได้ · บริหาร (view) อ่านได้แต่แก้ไม่ได้', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    expect((await summaryRoute.GET(request('GET', '/api/settings/device-catalog'), {})).status).toBe(200)
    const patched = await brandRoute.PATCH(request('PATCH', `/api/settings/device-catalog/brands/${BRAND_ID}`, { manualStatus: 'hidden' }), params(BRAND_ID))
    expect(patched.status).toBe(200)
    expect(queriesMock.updateDeviceBrand.mock.calls[0]?.[2]).toEqual({ manualStatus: 'hidden' })

    requireSessionMock.mockResolvedValue(EXECUTIVE)
    expect((await brandsRoute.GET(request('GET', '/api/settings/device-catalog/brands?visibility=hidden&page=2'), {})).status).toBe(200)
    expect(queriesMock.listDeviceBrands.mock.calls[0]?.[1]).toMatchObject({ visibility: 'hidden', page: 2 })
    expect((await brandRoute.PATCH(request('PATCH', `/api/settings/device-catalog/brands/${BRAND_ID}`, { manualStatus: null }), params(BRAND_ID))).status).toBe(403)
    expect((await tacUpdateRoute.POST(request('POST', '/api/settings/device-catalog/tac-update', {}), {})).status).toBe(403)
    expect(queriesMock.updateDeviceBrand).toHaveBeenCalledTimes(1)
  })

  it('การเงินไม่มีสิทธิ์ = 403 ทุก endpoint ของหน้าผู้ดูแล · ไม่แตะชั้นข้อมูล', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    expect((await summaryRoute.GET(request('GET', '/api/settings/device-catalog'), {})).status).toBe(403)
    expect((await settingsRoute.GET(request('GET', '/api/settings/device-catalog/settings'), {})).status).toBe(403)
    expect((await modelsRoute.GET(request('GET', '/api/settings/device-catalog/models'), {})).status).toBe(403)
    expect(
      (await statusRoute.POST(request('POST', '/api/settings/device-catalog/models/status', { ids: [MODEL_ID], manualStatus: 'active' }), {})).status,
    ).toBe(403)
    expect(queriesMock.listDeviceModels).not.toHaveBeenCalled()
    expect(queriesMock.bulkSetDeviceModelManualStatus).not.toHaveBeenCalled()
  })

  it('ตั้งค่าตัวกรอง: ทำความสะอาดรายชื่อ · จำนวนปีนอกช่วง = 400', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const ok = await settingsRoute.PATCH(
      request('PATCH', '/api/settings/device-catalog/settings', { brandNames: [' Samsung ', 'samsung', 'OPPO'], recentYears: 3, capacityOptions: ['128GB'], colorOptions: ['ดำ'], staleAlertDays: 90 }),
      {},
    )
    expect(ok.status).toBe(200)
    expect(settingsMock.updateDeviceCatalogSettings.mock.calls[0]?.[2]).toEqual({ brandNames: ['Samsung', 'OPPO'], recentYears: 3, capacityOptions: ['128GB'], colorOptions: ['ดำ'], staleAlertDays: 90 })
    for (const recentYears of [0, 31, 2.5]) {
      const bad = await settingsRoute.PATCH(request('PATCH', '/api/settings/device-catalog/settings', { brandNames: [], recentYears }), {})
      expect(bad.status).toBe(400)
    }
  })

  it('ตั้งการแสดงหลายรุ่น: null = กลับไปตามตัวกรอง · สถานะอื่นนอก active/hidden = 400', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const ok = await statusRoute.POST(request('POST', '/api/settings/device-catalog/models/status', { ids: [MODEL_ID], manualStatus: null }), {})
    expect(ok.status).toBe(200)
    expect(queriesMock.bulkSetDeviceModelManualStatus.mock.calls[0]?.[2]).toBeNull()
    const bad = await statusRoute.POST(
      request('POST', '/api/settings/device-catalog/models/status', { ids: [MODEL_ID], manualStatus: 'pending_review' }),
      {},
    )
    expect(bad.status).toBe(400)
  })

  it('id ผิดรูป = DEVICE_CATALOG_ITEM_NOT_FOUND (404) ไม่ยิง DB', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const response = await brandRoute.PATCH(request('PATCH', '/api/settings/device-catalog/brands/abc', { manualStatus: 'active' }), params('abc'))
    expect(response.status).toBe(404)
    expect(queriesMock.updateDeviceBrand).not.toHaveBeenCalled()
  })

  it('อัปเดตตอนนี้ (U166/U167): ผู้ดูแลตั้งงาน (ส่ง force ต่อ) · บริหาร (view) = 403 · ไม่รันงานจริงในเทสต์', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    tacMock.requestDeviceTacUpdate.mockResolvedValue({ jobId: 'job-1', duplicate: false })
    const response = await tacUpdateRoute.POST(request('POST', '/api/settings/device-catalog/tac-update', { force: true }), {})
    expect(response.status).toBe(202)
    expect(tacMock.requestDeviceTacUpdate.mock.calls[0]?.[1]).toEqual({ force: true })
    expect(tacMock.requestDeviceTacUpdate.mock.calls[0]?.[0]).toMatchObject({ actor: { id: ADMIN_OFFICE.id } })

    requireSessionMock.mockResolvedValue(EXECUTIVE)
    expect((await tacUpdateRoute.POST(request('POST', '/api/settings/device-catalog/tac-update', {}), {})).status).toBe(403)
    expect(tacMock.requestDeviceTacUpdate).toHaveBeenCalledTimes(1)
  })

  it('นำเข้าไฟล์เอง: path ขององค์กรอื่น = ปฏิเสธ · หัวตารางผิด = DEVICE_TAC_FILE_INVALID · ถูกต้อง = ตั้งงาน', async () => {
    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const path = '/api/settings/device-catalog/tac-import'
    const other = await tacImportRoute.POST(request('POST', path, { path: 'organization/org-2/device-tac/a.csv' }), {})
    expect(other.status).toBe(400)
    expect(storageMock.downloadUploadedFile).not.toHaveBeenCalled()

    storageMock.downloadUploadedFile.mockResolvedValueOnce(new TextEncoder().encode('a,b,c\n1,2,3'))
    const bad = await tacImportRoute.POST(request('POST', path, { path: 'organization/org-1/device-tac/a.csv' }), {})
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ error: { code: 'DEVICE_TAC_FILE_INVALID' } })

    storageMock.downloadUploadedFile.mockResolvedValueOnce(new TextEncoder().encode('Brand,TAC,SPECS\nAPPLE,35000005,"APPLE IPHONE 16, N/A, A1, 2024"'))
    tacMock.requestDeviceTacUpdate.mockResolvedValue({ jobId: 'job-2', duplicate: false })
    const ok = await tacImportRoute.POST(request('POST', path, { path: 'organization/org-1/device-tac/b.csv' }), {})
    expect(ok.status).toBe(202)
    expect(tacMock.requestDeviceTacUpdate.mock.calls.at(-1)?.[1]).toEqual({ filePath: 'organization/org-1/device-tac/b.csv' })
  })

  it('TAC: บริหารค้นได้ ผูกไม่ได้ · ผู้ดูแลผูก (TAC ผิดรูป = 400) · ประวัติ = view', async () => {
    requireSessionMock.mockResolvedValue(EXECUTIVE)
    tacMock.listDeviceTacs.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    expect((await tacsRoute.GET(request('GET', '/api/settings/device-catalog/tacs?q=3500&source=learned'), {})).status).toBe(200)
    expect(tacMock.listDeviceTacs.mock.calls[0]?.[1]).toMatchObject({ q: '3500', source: 'learned' })
    expect((await tacsRoute.POST(request('POST', '/api/settings/device-catalog/tacs', { tac: '35000005', deviceModelId: MODEL_ID }), {})).status).toBe(403)
    tacMock.getDeviceTacHistory.mockResolvedValue({ updates: [], learned: [] })
    expect((await tacHistoryRoute.GET(request('GET', '/api/settings/device-catalog/tac-history'), {})).status).toBe(200)

    requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
    const bad = await tacsRoute.POST(request('POST', '/api/settings/device-catalog/tacs', { tac: '3500', deviceModelId: MODEL_ID }), {})
    expect(bad.status).toBe(400)
    tacMock.bindDeviceTac.mockResolvedValue({ id: 't1' })
    const ok = await tacsRoute.POST(request('POST', '/api/settings/device-catalog/tacs', { tac: '3500-0005', deviceModelId: MODEL_ID }), {})
    expect(ok.status).toBe(201)
    expect(tacMock.bindDeviceTac.mock.calls[0]?.[1]).toMatchObject({ tac: '35000005', deviceModelId: MODEL_ID })

    requireSessionMock.mockResolvedValue(FINANCE)
    expect((await tacHistoryRoute.GET(request('GET', '/api/settings/device-catalog/tac-history'), {})).status).toBe(403)
  })
})

describe('ตัวเลือกในฟอร์มรับเคส', () => {
  it('(U166) ค้น TAC จาก IMEI: IMEI ผ่าน parseImei() ก่อน (ผิดรูป = 400) · พนักงานภาคสนาม = 403', async () => {
    requireSessionMock.mockResolvedValue(CASE_CLERK)
    tacMock.lookupDeviceTac.mockResolvedValue({ found: false })
    const ok = await tacLookupRoute.GET(request('GET', '/api/device-catalog/tac-lookup?imei=35-000005-123456-7'), {})
    expect(ok.status).toBe(200)
    expect(tacMock.lookupDeviceTac).toHaveBeenCalledWith('org-1', '350000051234567')
    expect((await tacLookupRoute.GET(request('GET', '/api/device-catalog/tac-lookup?imei=35000005123456X'), {})).status).toBe(400)

    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    expect((await tacLookupRoute.GET(request('GET', '/api/device-catalog/tac-lookup?imei=350000051234567'), {})).status).toBe(403)
  })

  it('(U166) ตัวเลือกความจุ/สี = ค่าตั้งขององค์กร', async () => {
    requireSessionMock.mockResolvedValue(CASE_CLERK)
    settingsMock.getDeviceCatalogSettings.mockResolvedValue({ capacityOptions: ['128GB'], colorOptions: ['ดำ'] })
    const response = await attributesRoute.GET(request('GET', '/api/device-catalog/attributes'), {})
    expect(await response.json()).toEqual({ data: { capacityOptions: ['128GB'], colorOptions: ['ดำ'] } })
  })

  it('ผู้สร้างเคสค้นได้ (ส่ง assetKind/q ต่อ) · พนักงานภาคสนาม = 403', async () => {
    requireSessionMock.mockResolvedValue(CASE_CLERK)
    const ok = await optionsRoute.GET(request('GET', '/api/device-catalog/options?assetKind=tablet&q=ipad'), {})
    expect(ok.status).toBe(200)
    expect(queriesMock.searchDeviceModelOptions).toHaveBeenCalledWith('org-1', { assetKind: 'tablet', q: 'ipad', limit: 20 })

    requireSessionMock.mockResolvedValue(FIELD_AGENT)
    expect((await optionsRoute.GET(request('GET', '/api/device-catalog/options?q=a'), {})).status).toBe(403)
  })

  describe('เลือกทั้งหมด / ไม่เลือกทั้งหมด (มติ PO U162)', () => {
    const path = '/api/settings/device-catalog/bulk-visibility'

    it('ผู้ดูแล: ส่งเงื่อนไขชุดเดียวกับรายการ + เหตุผลไปชั้นข้อมูล', async () => {
      requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
      queriesMock.bulkSetDeviceCatalogVisibility.mockResolvedValue({ updated: 3, unchanged: 1 })
      const response = await bulkRoute.POST(
        request('POST', path, { target: 'models', manualStatus: 'hidden', visibility: 'all', q: 'galaxy', brandId: BRAND_ID, reason: 'ปิดรุ่นเก่า' }),
        {},
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ data: { updated: 3, unchanged: 1 } })
      const [context, input] = queriesMock.bulkSetDeviceCatalogVisibility.mock.calls[0] ?? []
      expect(context).toMatchObject({ reason: 'ปิดรุ่นเก่า' })
      expect(input).toEqual({
        target: 'models',
        manualStatus: 'hidden',
        visibility: 'all',
        assetKind: 'all',
        brandId: BRAND_ID,
        q: 'galaxy',
        reason: 'ปิดรุ่นเก่า',
      })
    })

    it('ไม่กรอกเหตุผล / สถานะนอก active-hidden / target ผิด = 400 ไม่ยิง DB', async () => {
      requireSessionMock.mockResolvedValue(ADMIN_OFFICE)
      for (const body of [
        { target: 'brands', manualStatus: 'active', visibility: 'all' },
        { target: 'brands', manualStatus: 'active', visibility: 'all', reason: '   ' },
        { target: 'brands', manualStatus: null, visibility: 'all', reason: 'x' },
        { target: 'phones', manualStatus: 'active', visibility: 'all', reason: 'x' },
      ]) {
        expect((await bulkRoute.POST(request('POST', path, body), {})).status).toBe(400)
      }
      expect(queriesMock.bulkSetDeviceCatalogVisibility).not.toHaveBeenCalled()
    })

    it('บริหาร (view) / การเงิน = 403 ไม่ยิง DB', async () => {
      for (const user of [EXECUTIVE, FINANCE]) {
        requireSessionMock.mockResolvedValue(user)
        const response = await bulkRoute.POST(
          request('POST', path, { target: 'brands', manualStatus: 'active', visibility: 'all', reason: 'เปิดทั้งหมด' }),
          {},
        )
        expect(response.status).toBe(403)
      }
      expect(queriesMock.bulkSetDeviceCatalogVisibility).not.toHaveBeenCalled()
    })
  })
})
