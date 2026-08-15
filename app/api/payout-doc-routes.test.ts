import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'
import type { PayoutBatchDetailDto, PayoutBatchItemDto } from '@/lib/payout/types'

/**
 * เทสต์ระดับ route ของ **เอกสารภายใน 3 ใบของรอบจ่ายเงิน** (`28` §6.1 · `17` §12)
 *
 * ตรวจสิ่งที่ pure module ตรวจแทนไม่ได้: capability ที่ผูกกับ endpoint (DEC-002),
 * header ของไฟล์ PDF, **ฟอนต์ไทยถูกฝังจริง** (ไม่ register = ตัวอักษรไทยหายทั้งใบโดยไม่มี error)
 * และการแปลง `PayoutError` เป็น status ตามทะเบียน `24` · เนื้อหาเอกสารทดสอบที่ `payout-doc.test.ts`
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const queriesMock = vi.hoisted(() => ({
  getPayoutDocSource: vi.fn(),
  MANAGE_PAYOUT_BATCH: 'manage_payout_batch',
}))
vi.mock('@/lib/payout/queries', () => queriesMock)

const { GET: getSummary } = await import('@/app/api/payout-batches/[id]/summary-pdf/route')
const { GET: getVoucher } = await import('@/app/api/payout-batches/[id]/voucher-pdf/route')
const { GET: getPayslip } = await import('@/app/api/payout-batches/[id]/payslip-pdf/route')

const BATCH_ID = '00000000-0000-4000-8000-000000000901'
const PAYEE_ID = '00000000-0000-4000-8000-000000000902'
const OTHER_PAYEE_ID = '00000000-0000-4000-8000-000000000903'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'finance@example.com',
    fullName: 'การเงิน ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'การเงิน',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const FINANCE = sessionUser({ manage_payout_batch: 'manage', generate_payment_file: 'manage' })
/** บัญชี/ผู้บริหาร = อ่านอย่างเดียว แต่ยังพิมพ์เอกสารได้ (`17` §12) */
const ACCOUNTANT = sessionUser({ manage_payout_batch: 'view' })
/** พนักงานภาคสนามไม่มี capability ของรอบจ่ายเลย */
const FIELD_AGENT = sessionUser({ perform_field_work: 'manage' })

function request(url: string): NextRequest {
  const base = new Request(url) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function item(overrides: Partial<PayoutBatchItemDto> = {}): PayoutBatchItemDto {
  return {
    id: 'item-1',
    source: 'expense',
    sourceId: 'exp-1',
    payeeId: PAYEE_ID,
    payeeName: 'ประยุทธ์ บุญมี',
    teamName: 'ทีมรับเหมาเหนือ',
    description: 'ค่าคอมมิชชั่น',
    caseRef: 'SF-2026-00832',
    trackingRound: 1,
    grossSatang: 850_000,
    whtSatang: 25_500,
    netSatang: 824_500,
    taxProfileId: 'tax-1',
    taxProfileName: 'บุคคลธรรมดา 3%',
    whtPctSnapshot: 3,
    bankName: 'ธนาคารกสิกรไทย',
    accountNumberMasked: 'xxx-x-x1234-x',
    ...overrides,
  }
}

function docSource(overrides: Partial<PayoutBatchDetailDto> = {}) {
  const batch: PayoutBatchDetailDto = {
    id: BATCH_ID,
    name: 'รอบจ่าย Outsource ตัดรอบ 30/06/2569',
    side: 'outsource',
    status: 'file_generated',
    grossSatang: 850_000,
    whtSatang: 25_500,
    netSatang: 824_500,
    itemCount: 1,
    bankAccountId: 'acc-1',
    bankAccountLabel: 'ธนาคารกสิกรไทย xxx-x-x9876-x',
    idempotencyKey: 'PB-OUT-25690705-ABCDEF',
    paymentFileUrl: 'payout-batches/x/PB-OUT-25690705-ABCDEF-v1.csv',
    paymentFileGeneratedAt: '2026-07-05T00:00:00.000Z',
    createdAt: '2026-06-30T02:00:00.000Z',
    createdByName: 'การเงิน ทดสอบ',
    updatedAt: '2026-07-05T00:00:00.000Z',
    items: [item()],
    ...overrides,
  }
  return {
    batch,
    issuer: { name: 'บริษัท ใจดี โมบาย จำกัด', address: '123 ถ.พระราม 1', taxId: '0105512345678', phone: null },
  }
}

interface Envelope {
  success: boolean
  error: { code: string } | null
}

async function codeOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as Envelope).error?.code
}

beforeEach(() => {
  requireSessionMock.mockReset()
  queriesMock.getPayoutDocSource.mockReset()
})

describe('สิทธิ์ของเอกสารรอบจ่าย (DEC-002 · `17` §12)', () => {
  it('ไม่มี capability ของรอบจ่าย = 403 ทั้ง 3 ใบ', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const responses = await Promise.all([
      getSummary(request(`http://localhost/api/payout-batches/${BATCH_ID}/summary-pdf`), params(BATCH_ID)),
      getVoucher(request(`http://localhost/api/payout-batches/${BATCH_ID}/voucher-pdf`), params(BATCH_ID)),
      getPayslip(request(`http://localhost/api/payout-batches/${BATCH_ID}/payslip-pdf`), params(BATCH_ID)),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(queriesMock.getPayoutDocSource).not.toHaveBeenCalled()
  })

  it('บัญชี/ผู้บริหารที่มีสิทธิ์ระดับ view พิมพ์เอกสารได้ (read-only)', async () => {
    requireSessionMock.mockResolvedValue(ACCOUNTANT)
    queriesMock.getPayoutDocSource.mockResolvedValue(docSource())

    const response = await getSummary(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/summary-pdf`),
      params(BATCH_ID),
    )
    expect(response.status).toBe(200)
  })
})

describe('สรุปรอบจ่ายเงิน (`04_payout_batch_summary.pdf`)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(FINANCE))

  it('ตอบไฟล์ PDF จริง + ฟอนต์ไทยฝังอยู่ + ไม่ cache', async () => {
    queriesMock.getPayoutDocSource.mockResolvedValue(docSource())

    const response = await getSummary(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/summary-pdf`),
      params(BATCH_ID),
    )
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''")
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // ไม่ register ฟอนต์ = ตัวอักษรไทยหายทั้งใบ **โดยไม่มี error** (`28` §7)
    expect(body.toString('latin1')).toContain('NotoSansThai')
  })

  it('รอบที่ยัง draft ออกเอกสารไม่ได้ — 400 PAYOUT_BATCH_INVALID_STATUS', async () => {
    queriesMock.getPayoutDocSource.mockResolvedValue(docSource({ status: 'draft' }))

    const response = await getSummary(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/summary-pdf`),
      params(BATCH_ID),
    )
    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('PAYOUT_BATCH_INVALID_STATUS')
  })
})

describe('ใบสำคัญจ่าย (`05_payment_voucher.pdf`)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(FINANCE))

  it('รอบที่ยังไม่สร้างไฟล์โอน = 404 PAYMENT_FILE_NOT_GENERATED (ใบนี้เป็นหลักฐานการจ่าย)', async () => {
    queriesMock.getPayoutDocSource.mockResolvedValue(
      docSource({ status: 'checking', paymentFileUrl: null, paymentFileGeneratedAt: null, idempotencyKey: null }),
    )

    const response = await getVoucher(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/voucher-pdf`),
      params(BATCH_ID),
    )
    expect(response.status).toBe(404)
    expect(await codeOf(response)).toBe('PAYMENT_FILE_NOT_GENERATED')
  })

  it('กรองตาม payeeId ได้ · payee ที่ไม่มีรายการในรอบ = 400 NO_ITEMS_TO_PAY', async () => {
    queriesMock.getPayoutDocSource.mockResolvedValue(docSource())

    const ok = await getVoucher(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/voucher-pdf?payeeId=${PAYEE_ID}`),
      params(BATCH_ID),
    )
    expect(ok.status).toBe(200)

    const empty = await getVoucher(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/voucher-pdf?payeeId=${OTHER_PAYEE_ID}`),
      params(BATCH_ID),
    )
    expect(empty.status).toBe(400)
    expect(await codeOf(empty)).toBe('NO_ITEMS_TO_PAY')
  })

  it('payeeId ที่ไม่ใช่ UUID = 400 พร้อม field error (Zod ชุดเดียวกับ FE)', async () => {
    queriesMock.getPayoutDocSource.mockResolvedValue(docSource())

    const response = await getVoucher(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/voucher-pdf?payeeId=not-a-uuid`),
      params(BATCH_ID),
    )
    expect(response.status).toBe(400)
    expect(queriesMock.getPayoutDocSource).not.toHaveBeenCalled()
  })
})

describe('สลิปค่าตอบแทน (`06_payslip.pdf`)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(FINANCE))

  it('ออกได้ตั้งแต่รอบยัง checking (เอกสารสรุปยอด ไม่ใช่หลักฐานการจ่าย)', async () => {
    queriesMock.getPayoutDocSource.mockResolvedValue(
      docSource({ status: 'checking', paymentFileUrl: null, paymentFileGeneratedAt: null, idempotencyKey: null }),
    )

    const response = await getPayslip(
      request(`http://localhost/api/payout-batches/${BATCH_ID}/payslip-pdf`),
      params(BATCH_ID),
    )
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(body.toString('latin1')).toContain('NotoSansThai')
  })
})
