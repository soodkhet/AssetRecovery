import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import { WarehouseError } from '@/lib/warehouse/errors'
import type { AssetDetailDto, LotDetailDto } from '@/lib/warehouse/types'

/**
 * เทสต์ระดับ route ของโมดูลคลัง (`44` §15 · `45` §6.4–6.5)
 *
 * ตรวจสิ่งที่ชั้น service ตรวจแทนไม่ได้: **capability ที่ผูกกับแต่ละ endpoint** (DEC-002),
 * envelope/warning ที่ออกไปจริง, การแปลง `WarehouseError` เป็น status ตามทะเบียน `24`,
 * และ header ของไฟล์ PDF/Excel · ตรรกะธุรกิจอยู่ที่ `warehouse-workflow.db.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  listAssets: vi.fn(),
  getAsset: vi.fn(),
  intakeAsset: vi.fn(),
  rejectAssetIntake: vi.fn(),
  listLots: vi.fn(),
  getLot: vi.fn(),
  createLot: vi.fn(),
  confirmLot: vi.fn(),
  getHandoverDocSource: vi.fn(),
}))
vi.mock('@/lib/warehouse/queries', () => queriesMock)

const { GET: getAssets } = await import('@/app/api/assets/route')
const { POST: postIntake } = await import('@/app/api/assets/[id]/intake/route')
const { POST: postRejectIntake } = await import('@/app/api/assets/[id]/reject-intake/route')
const { POST: postLot } = await import('@/app/api/handover-lots/route')
const { PATCH: patchConfirm } = await import('@/app/api/handover-lots/[id]/confirm/route')
const { GET: getPdf } = await import('@/app/api/handover-lots/[id]/pdf/route')
const { GET: getExcel } = await import('@/app/api/handover-lots/[id]/export-excel/route')

const ASSET_ID = '00000000-0000-4000-8000-000000000101'
const LOT_ID = '00000000-0000-4000-8000-000000000201'
const COMPANY_ID = '00000000-0000-4000-8000-000000000301'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'admin@example.com',
    fullName: 'ธุรการ ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'ธุรการ',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const WAREHOUSE_ADMIN = sessionUser({
  intake_asset: 'manage',
  reject_asset_intake: 'manage',
  create_handover_lot: 'manage',
  confirm_handover_lot: 'manage',
})
/** พนักงานภาคสนามไม่มี capability ของคลังเลย (`44` §13) */
const FIELD_AGENT = sessionUser({ perform_field_work: 'manage' })
/** การเงิน/บัญชี = ดูอย่างเดียว */
const FINANCE_VIEWER = sessionUser({ view_master_data: 'view' })

function request(url = 'http://localhost/api/assets', init?: RequestInit): NextRequest {
  const base = new Request(url, init) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const assetDetail = {
  id: ASSET_ID,
  assetStatus: 'in_custody',
} as unknown as AssetDetailDto

const lotDetail = {
  id: LOT_ID,
  lotNumber: 'LOT-2569-001',
  docRef: 'DLV-2569-001',
  type: 'finance_pickup',
  status: 'pending_attach',
  companyId: COMPANY_ID,
  companyName: 'บริษัท เอสเอฟ ลีสซิ่ง จำกัด',
  scheduledAt: null,
  deliveredAt: null,
  confirmedAt: null,
  assetCount: 1,
  tab: 'pending_handover',
  contactPerson: null,
  deliveryAddr: null,
  trackingNo: null,
  signedDocUrl: null,
  deliveryProofUrl: null,
  note: null,
  confirmedByName: null,
  createdAt: '2026-07-05T03:00:00.000Z',
  assets: [
    {
      id: ASSET_ID,
      caseRef: 'SF-2026-00832',
      debtorName: 'สมชาย ใจดี',
      deviceDesc: 'iPhone 15 สีดำ',
      imeiContract: '355000000000001',
      imeiActual: '355000000000001',
      serialContract: null,
      serialActual: null,
      condition: 'normal',
      conditionNote: null,
    },
  ],
} as unknown as LotDetailDto

const docSource = {
  lot: lotDetail,
  issuer: { name: 'บริษัท ใจดี โมบาย จำกัด', address: '123 ถ.พระราม 1', taxId: '0105512345678', phone: null },
  recipient: { name: 'บริษัท เอสเอฟ ลีสซิ่ง จำกัด', address: '99 ถ.สุขุมวิท', taxId: '0105598765432', phone: null },
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string } | null
  warning?: { code: string }
}

async function envelopeOf<T>(response: Response): Promise<Envelope<T>> {
  return (await response.json()) as Envelope<T>
}

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const fn of Object.values(queriesMock)) fn.mockReset()
})

describe('สิทธิ์ของแต่ละ endpoint (DEC-002 · `44` §13)', () => {
  it('พนักงานภาคสนามเรียก endpoint ของคลังไม่ได้เลย — 403 ทุกเส้น', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const responses = await Promise.all([
      getAssets(request(), undefined),
      postIntake(jsonRequest(`http://localhost/api/assets/${ASSET_ID}/intake`, 'POST', {}), params(ASSET_ID)),
      postLot(jsonRequest('http://localhost/api/handover-lots', 'POST', {}), undefined),
      patchConfirm(
        jsonRequest(`http://localhost/api/handover-lots/${LOT_ID}/confirm`, 'PATCH', {}),
        params(LOT_ID),
      ),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(queriesMock.listAssets).not.toHaveBeenCalled()
    expect(queriesMock.intakeAsset).not.toHaveBeenCalled()
  })

  it('การเงิน/บัญชีดูรายการได้ (view) แต่สั่งงานคลังไม่ได้ (manage)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE_VIEWER)
    queriesMock.listAssets.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 })

    expect((await getAssets(request(), undefined)).status).toBe(200)
    expect(
      (await postLot(jsonRequest('http://localhost/api/handover-lots', 'POST', {}), undefined)).status,
    ).toBe(403)
  })

  it('ธุรการที่ถือ capability ครบเรียกได้ทั้งรับเข้าและยืนยันส่งมอบ', async () => {
    requireSessionMock.mockResolvedValue(WAREHOUSE_ADMIN)
    queriesMock.intakeAsset.mockResolvedValue({ asset: assetDetail, events: ['asset.intake_confirmed'] })
    queriesMock.confirmLot.mockResolvedValue({ lot: lotDetail, events: [] })

    const intake = await postIntake(
      jsonRequest(`http://localhost/api/assets/${ASSET_ID}/intake`, 'POST', {
        imeiActual: '355000000000001',
        condition: 'normal',
      }),
      params(ASSET_ID),
    )
    const confirm = await patchConfirm(
      jsonRequest(`http://localhost/api/handover-lots/${LOT_ID}/confirm`, 'PATCH', {
        signedDocUrl: 'https://storage/signed.pdf',
      }),
      params(LOT_ID),
    )

    expect(intake.status).toBe(200)
    expect(confirm.status).toBe(200)
  })
})

describe('POST /api/assets/:id/intake', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(WAREHOUSE_ADMIN))

  it('IMEI ไม่ตรง = 200 พร้อม `warning` ใน envelope (เตือน ไม่ block · `44` §12)', async () => {
    queriesMock.intakeAsset.mockResolvedValue({
      asset: assetDetail,
      warning: { code: 'IMEI_MISMATCH', title: 'IMEI ไม่ตรง', message: 'บันทึกค่าที่ตรวจจริงแล้ว' },
      events: ['asset.intake_confirmed'],
    })

    const response = await postIntake(
      jsonRequest(`http://localhost/api/assets/${ASSET_ID}/intake`, 'POST', {
        imeiActual: '355000000000999',
        condition: 'normal',
      }),
      params(ASSET_ID),
    )

    expect(response.status).toBe(200)
    const body = await envelopeOf<AssetDetailDto>(response)
    expect(body.success).toBe(true)
    expect(body.warning?.code).toBe('IMEI_MISMATCH')
  })

  it('IMEI ผิดรูปแบบ = 400 REQUIRED_MISSING พร้อม field errors (ไม่ถึงชั้น service)', async () => {
    const response = await postIntake(
      jsonRequest(`http://localhost/api/assets/${ASSET_ID}/intake`, 'POST', {
        imeiActual: '35500',
        condition: 'normal',
      }),
      params(ASSET_ID),
    )

    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('REQUIRED_MISSING')
    expect(queriesMock.intakeAsset).not.toHaveBeenCalled()
  })

  it('error ของโมดูลถูกแปลงเป็น status ตามทะเบียน (`ASSET_NOT_FOUND` = 404)', async () => {
    queriesMock.intakeAsset.mockRejectedValue(new WarehouseError('ASSET_NOT_FOUND'))

    const response = await postIntake(
      jsonRequest(`http://localhost/api/assets/${ASSET_ID}/intake`, 'POST', {
        imeiActual: '355000000000001',
        condition: 'normal',
      }),
      params(ASSET_ID),
    )

    expect(response.status).toBe(404)
    expect((await envelopeOf(response)).error?.code).toBe('ASSET_NOT_FOUND')
  })
})

describe('POST /api/assets/:id/reject-intake', () => {
  it('เหตุผลว่างผ่าน schema แล้วไปตกที่ REJECT_MISSING_REASON (ไม่ใช่ REQUIRED_MISSING)', async () => {
    requireSessionMock.mockResolvedValue(WAREHOUSE_ADMIN)
    queriesMock.rejectAssetIntake.mockRejectedValue(new WarehouseError('REJECT_MISSING_REASON'))

    const response = await postRejectIntake(
      jsonRequest(`http://localhost/api/assets/${ASSET_ID}/reject-intake`, 'POST', { rejectReason: '   ' }),
      params(ASSET_ID),
    )

    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('REJECT_MISSING_REASON')
  })
})

describe('POST /api/handover-lots', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(WAREHOUSE_ADMIN))

  it('สร้างสำเร็จตอบ 201', async () => {
    queriesMock.createLot.mockResolvedValue(lotDetail)

    const response = await postLot(
      jsonRequest('http://localhost/api/handover-lots', 'POST', {
        companyId: COMPANY_ID,
        assetIds: [ASSET_ID],
        type: 'finance_pickup',
      }),
      undefined,
    )

    expect(response.status).toBe(201)
    expect((await envelopeOf<LotDetailDto>(response)).data?.lotNumber).toBe('LOT-2569-001')
  })

  it('ล็อตว่างผ่าน schema แล้วไปตกที่ EMPTY_LOT ของ `44` §12', async () => {
    queriesMock.createLot.mockRejectedValue(new WarehouseError('EMPTY_LOT'))

    const response = await postLot(
      jsonRequest('http://localhost/api/handover-lots', 'POST', {
        companyId: COMPANY_ID,
        assetIds: [],
        type: 'finance_pickup',
      }),
      undefined,
    )

    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('EMPTY_LOT')
  })
})

describe('PATCH /api/handover-lots/:id/confirm', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(WAREHOUSE_ADMIN))

  it('ทรานแซกชันล้ม = 500 CONFIRM_TRANSACTION_FAILED (ไม่กลืนเป็น 400)', async () => {
    queriesMock.confirmLot.mockRejectedValue(new WarehouseError('CONFIRM_TRANSACTION_FAILED'))

    const response = await patchConfirm(
      jsonRequest(`http://localhost/api/handover-lots/${LOT_ID}/confirm`, 'PATCH', {
        signedDocUrl: 'https://storage/signed.pdf',
      }),
      params(LOT_ID),
    )

    expect(response.status).toBe(500)
    expect((await envelopeOf(response)).error?.code).toBe('CONFIRM_TRANSACTION_FAILED')
  })

  it('ล็อตที่ยืนยันแล้ว = 400 LOT_ALREADY_CONFIRMED', async () => {
    queriesMock.confirmLot.mockRejectedValue(new WarehouseError('LOT_ALREADY_CONFIRMED'))

    const response = await patchConfirm(
      jsonRequest(`http://localhost/api/handover-lots/${LOT_ID}/confirm`, 'PATCH', {}),
      params(LOT_ID),
    )

    expect(response.status).toBe(400)
    expect((await envelopeOf(response)).error?.code).toBe('LOT_ALREADY_CONFIRMED')
  })
})

describe('เอกสารของล็อต (`44` §6.4)', () => {
  beforeEach(() => queriesMock.getHandoverDocSource.mockResolvedValue(docSource))

  it('PDF: ตอบไฟล์จริง + ชื่อไฟล์ตามเลขล็อต + ไม่ cache', async () => {
    requireSessionMock.mockResolvedValue(WAREHOUSE_ADMIN)

    const response = await getPdf(request(`http://localhost/api/handover-lots/${LOT_ID}/pdf`), params(LOT_ID))
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('LOT-2569-001.pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // ฟอนต์ไทยต้องถูกฝังจริง — ไม่ register แล้วตัวอักษรไทยหายทั้งใบ **โดยไม่มี error**
    expect(body.toString('latin1')).toContain('NotoSansThai')
  }, 30_000)

  it('Excel: ตอบไฟล์ .xlsx จริง', async () => {
    requireSessionMock.mockResolvedValue(WAREHOUSE_ADMIN)

    const response = await getExcel(
      request(`http://localhost/api/handover-lots/${LOT_ID}/export-excel`),
      params(LOT_ID),
    )
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml.sheet')
    expect(response.headers.get('content-disposition')).toContain('LOT-2569-001.xlsx')
    expect(body.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('บริษัทไฟแนนซ์โหลดเอกสารส่งมอบไม่ได้ (`44` §13 — ช่องทางคือ Client Portal)', async () => {
    requireSessionMock.mockResolvedValue(sessionUser({ view_own_company_data: 'view' }))

    const response = await getPdf(request(`http://localhost/api/handover-lots/${LOT_ID}/pdf`), params(LOT_ID))
    expect(response.status).toBe(403)
    expect(queriesMock.getHandoverDocSource).not.toHaveBeenCalled()
  })
})
