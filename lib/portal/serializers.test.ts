import { describe, expect, it } from 'vitest'
import { AssignmentStatus, CaseStatus, HandoverLotStatus } from '@/lib/generated/prisma/enums'
import {
  portalAssetPhotoMeta,
  portalBillingBatchNumber,
  serializePortalBillingBatch,
  serializePortalBillingBatches,
  serializePortalCaseDetail,
  serializePortalCaseListItem,
  serializePortalCompanyProfile,
  serializePortalDashboard,
  serializePortalLotDetail,
  serializePortalLotListItem,
  serializePortalTaxInvoice,
  type PortalCaseDetailSource,
} from '@/lib/portal/serializers'

/** ฟิลด์ภายในที่ห้ามหลุดออกพอร์ทัล — คีย์ + ค่า sentinel ที่ต้องไม่ปรากฏใน output */
const FORBIDDEN: Record<string, string | number> = {
  imei: '356789012345678',
  imeiContract: '356789012345679',
  imeiActual: '356789012345670',
  serialNo: 'SN-SECRET-1',
  serialContract: 'SN-SECRET-2',
  serialActual: 'SN-SECRET-3',
  agentId: 'agent-uuid-secret',
  agentName: 'สมชาย พนักงานลับ',
  agentPhone: '0899999999',
  teamId: 'team-uuid-secret',
  teamName: 'ทีมลับเหนือ',
  assignedTeamId: 'team-uuid-secret-2',
  assignedTeamName: 'ทีมลับใต้',
  suggestedTeamId: 'team-uuid-secret-3',
  suggestedTeamName: 'ทีมลับกลาง',
  teamChangeReason: 'เหตุผลเปลี่ยนทีมภายใน',
  serviceFeeTemplateId: 'tmpl-uuid-secret',
  projectedRevenueSource: 'template:tmpl-uuid-secret@v3',
  compPlanId: 'comp-plan-secret',
  compensationSatang: 777_001,
  costSatang: 777_002,
  commissionSatang: 777_003,
  reviewedBy: 'reviewer-uuid-secret',
  reviewedByName: 'ผู้พิจารณาลับ',
  createdBy: 'creator-uuid-secret',
  createdByName: 'แอดมินหลังบ้านลับ',
  confirmedBy: 'confirmer-uuid-secret',
  rejectReason: 'เหตุผลตีกลับคลังภายใน',
  note: 'บันทึกภายในล็อต',
  contactPerson: 'ผู้ติดต่อรับของภายใน',
  deliveryAddr: 'ที่อยู่จัดส่งภายใน',
  trackingNo: 'TRACK-SECRET',
  signedDocUrl: 'storage/secret/signed.pdf',
  deliveryProofUrl: 'storage/secret/proof.jpg',
  signedDocHash: 'a'.repeat(64),
  cancelReason: 'เหตุผลยกเลิกภายใน',
  cancelledBy: 'canceller-uuid-secret',
  organizationId: 'org-uuid-secret',
  companyId: 'company-uuid-secret',
  vatMode: 'exclude_vat_secret',
  billingDay: 977,
  paymentDueDays: 978,
  suspendedReason: 'เหตุระงับภายใน',
  whtWithheldByCustomerPct: 979,
  debtorNationalId: '1234567890123',
  debtorPhoneMobile: '0811111111',
  addrDetail: 'บ้านเลขที่ลับ',
}

const PHOTO_PATH = 'org/secret/assets/photo-1.jpg'
const REVIEW_NOTE = 'กรุณาแนบสำเนาบัตรเพิ่ม'

const RAW_ENUMS = new Set<string>([
  ...Object.values(CaseStatus),
  ...Object.values(AssignmentStatus),
  ...Object.values(HandoverLotStatus),
])

function deepScan(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => deepScan(item, [...path, String(index)]))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      expect(Object.keys(FORBIDDEN), `คีย์ต้องห้าม ${[...path, key].join('.')}`).not.toContain(key)
      expect(key).not.toMatch(/^status$/)
      deepScan(child, [...path, key])
    }
    return
  }
  const where = path.join('.')
  expect(Object.values(FORBIDDEN), `ค่าต้องห้ามที่ ${where}`).not.toContain(value)
  if (typeof value === 'string') {
    expect(value, `path ไฟล์หลุดที่ ${where}`).not.toBe(PHOTO_PATH)
    expect(RAW_ENUMS.has(value), `raw enum "${value}" ที่ ${where}`).toBe(false)
  }
}

const CREATED = new Date('2026-09-01T03:00:00Z')

function caseRow(status: CaseStatus, extra: Partial<PortalCaseDetailSource> = {}): PortalCaseDetailSource {
  return {
    ...FORBIDDEN,
    id: 'case-1',
    caseRef: 'SF-2026-00832',
    debtorName: 'ลูกหนี้ ทดสอบ',
    status,
    assignmentStatus: null,
    trackingRound: 1,
    reviewNote: REVIEW_NOTE,
    createdAt: CREATED,
    serviceFeeModelSnapshot: 'HYBRID',
    serviceFeeRatePct: '10.50',
    serviceFeeBaseSatang: 50_000,
    serviceFeeBasisSnapshot: 'debt_amount',
    serviceFeeChargeOnFail: true,
    projectedRevenueSatang: 150_000,
    asset: { ...FORBIDDEN, id: 'asset-1', photos: [PHOTO_PATH, 'p2', 'p3'], condition: 'damaged', conditionNote: 'จอแตก' },
    ...extra,
  } as PortalCaseDetailSource
}

describe('portal serializers — กันหลุด (deep-scan)', () => {
  it('เคส list/detail ทุกสถานะ', () => {
    for (const status of Object.values(CaseStatus)) {
      for (const assignmentStatus of [null, ...Object.values(AssignmentStatus)]) {
        const row = caseRow(status, { assignmentStatus })
        deepScan(serializePortalCaseListItem(row))
        deepScan(serializePortalCaseDetail(row))
      }
    }
  })

  it('billing / ใบกำกับ / ล็อต / profile / dashboard', () => {
    const billing = {
      ...FORBIDDEN,
      id: 'bb-1',
      period: '09/2569',
      status: 'partially_paid' as const,
      totalSatang: 100_000,
      receivedSatang: 40_000,
      whtWithheldByCustomerSatang: 3_000,
      dueDate: new Date('2026-10-31T00:00:00Z'),
      sentAt: CREATED,
      caseCount: 3,
    }
    deepScan(serializePortalBillingBatches([billing]))
    deepScan(
      serializePortalTaxInvoice({
        ...FORBIDDEN,
        id: 'ti-1',
        invoiceNumber: 'INV-2569-0001',
        invoiceDate: new Date('2026-09-30T00:00:00Z'),
        status: 'cancelled',
        totalBeforeVatSatang: 100_000,
        vatSatang: 7_000,
        totalSatang: 107_000,
        deliveryFormat: 'paper_pdf',
        // ใบลดหนี้ (มติ U14): แถวภายในมี reason/ไฟล์สแกน/Adjustment/ผู้บันทึก — ต้องไม่หลุด
        creditNotes: [
          {
            ...FORBIDDEN,
            reason: 'เหตุผลลดหนี้ภายในลับ',
            filePath: 'storage/secret/credit-note.pdf',
            fileSha256: 'b'.repeat(64),
            adjustmentId: 'adjustment-uuid-secret',
            id: 'cn-1',
            creditNoteNumber: 'CN-2569-0001',
            issueDate: '2026-10-01T00:00:00.000Z',
            amountBeforeVatSatang: 10_000,
            vatSatang: 700,
            totalSatang: 10_700,
          } as Parameters<typeof serializePortalTaxInvoice>[0]['creditNotes'][number],
        ],
      }),
    )
    const lotAsset = { ...FORBIDDEN, id: 'asset-1', caseRef: 'SF-1', debtorName: 'ก', deviceDesc: 'iPhone 15', condition: null, conditionNote: null, photos: [PHOTO_PATH] }
    for (const status of Object.values(HandoverLotStatus)) {
      const lot = { ...FORBIDDEN, id: 'lot-1', lotNumber: 'LOT-2569-001', docRef: 'DLV-2569-001', type: 'we_deliver' as const, status, createdAt: CREATED, confirmedAt: null }
      deepScan(serializePortalLotListItem({ ...lot, assetCount: 1 }))
      deepScan(serializePortalLotDetail({ ...lot, hasDeliveryProof: true, assets: [lotAsset] }))
    }
    deepScan(
      serializePortalCompanyProfile({
        ...FORBIDDEN,
        name: 'บริษัท ก',
        taxId: '0105551234567',
        address: 'กรุงเทพ',
        contactName: 'คุณติดต่อ',
        contactPhone: '021234567',
        signerName: 'คุณลงนาม',
        serviceFeeTemplate: { ...FORBIDDEN, templateName: 'มาตรฐาน', model: 'SUCCESS_FEE' },
      } as Parameters<typeof serializePortalCompanyProfile>[0]),
    )
    deepScan(
      serializePortalDashboard(
        { inProgressCaseCount: 3, arOutstandingSatang: 57_000, latestTaxInvoice: null, pendingLotCount: 1 },
        { portal_cases: 'view', portal_finance: 'view', portal_handover: 'view' },
      ),
    )
    deepScan(portalAssetPhotoMeta({ id: 'asset-1', photos: [PHOTO_PATH] }, 0))
  })
})

describe('portal serializers — เนื้อหา', () => {
  it('ใบกำกับ + ใบลดหนี้ (U14): ยอดหน้าใบไม่หัก · ยอดสุทธิ = หน้าใบ − ใบลดหนี้ · ใบลดหนี้มีแค่ฟิลด์ whitelist', () => {
    const dto = serializePortalTaxInvoice({
      id: 'ti-2',
      invoiceNumber: 'INV-2569-0002',
      invoiceDate: new Date('2026-09-30T00:00:00Z'),
      status: 'active',
      totalBeforeVatSatang: 100_000,
      vatSatang: 7_000,
      totalSatang: 107_000,
      deliveryFormat: 'paper_pdf',
      creditNotes: [
        {
          id: 'cn-1',
          creditNoteNumber: 'CN-1',
          issueDate: new Date('2026-10-01T00:00:00Z'),
          amountBeforeVatSatang: 10_000,
          vatSatang: 700,
          totalSatang: 10_700,
          reason: 'ลับ',
          createdBy: 'u-1',
          filePath: 'x/y.pdf',
          adjustmentId: 'adj-1',
        } as Parameters<typeof serializePortalTaxInvoice>[0]['creditNotes'][number],
      ],
    })
    expect(dto).toMatchObject({ totalSatang: 107_000, netBeforeVatSatang: 90_000, netVatSatang: 6_300, netTotalSatang: 96_300 })
    expect(dto.creditNotes).toEqual([
      { id: 'cn-1', creditNoteNumber: 'CN-1', issueDate: '2026-10-01', amountBeforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700 },
    ])
  })

  it('need_info + reason → "ขอข้อมูลเพิ่มเติม" พร้อมเหตุผล (97 §20)', () => {
    const dto = serializePortalCaseListItem(caseRow('need_info'))
    expect(dto.statusDisplay.label).toBe('ขอข้อมูลเพิ่มเติม')
    expect(dto.statusReason).toBe(REVIEW_NOTE)
    expect(serializePortalCaseListItem(caseRow('rejected')).statusReason).toBe(REVIEW_NOTE)
    expect(serializePortalCaseListItem(caseRow('approved')).statusReason).toBeNull()
  })

  it('วันที่ ISO UTC · recycleRound เฉพาะเคยรีไซเคิล', () => {
    expect(serializePortalCaseListItem(caseRow('active')).createdAt).toBe('2026-09-01T03:00:00.000Z')
    expect(serializePortalCaseListItem(caseRow('active')).recycleRound).toBeNull()
    expect(serializePortalCaseListItem(caseRow('active', { trackingRound: 2 })).recycleRound).toBe(2)
  })

  it('ค่าบริการเห็นครบ (v4.1) แต่ไม่มี template id · ยังไม่อนุมัติ = null', () => {
    const fee = serializePortalCaseDetail(caseRow('active')).serviceFee
    expect(fee).toMatchObject({ model: 'HYBRID', ratePct: 10.5, baseSatang: 50_000, basis: 'debt_amount', chargeOnFail: true, projectedRevenueSatang: 150_000 })
    expect(serializePortalCaseDetail(caseRow('pending_review', { serviceFeeModelSnapshot: null })).serviceFee).toBeNull()
  })

  it('รูปทรัพย์เฉพาะ "ติดตามสำเร็จ" (ไม่ถูกตีกลับ)', () => {
    expect(serializePortalCaseDetail(caseRow('closed_success')).assetPhotos).toEqual({
      assetId: 'asset-1',
      photoCount: 3,
      condition: 'damaged',
      conditionLabel: 'ชำรุด',
      conditionNote: 'จอแตก',
    })
    expect(serializePortalCaseDetail(caseRow('closed_success', { assignmentStatus: 'needs_revision' })).assetPhotos).toBeNull()
    expect(serializePortalCaseDetail(caseRow('active')).assetPhotos).toBeNull()
  })

  it('billing draft ถูกกรอง · ยอดค้างใช้สูตรกลาง', () => {
    const base = { id: 'b', period: '09/2569', totalSatang: 100_000, receivedSatang: 40_000, whtWithheldByCustomerSatang: 3_000, dueDate: new Date('2026-10-31T00:00:00Z'), sentAt: null, caseCount: 4 }
    expect(serializePortalBillingBatch({ ...base, status: 'draft' })).toBeNull()
    expect(serializePortalBillingBatches([{ ...base, status: 'draft' }, { ...base, id: 'c', status: 'sent' }]).map((row) => row.id)).toEqual(['c'])
    const dto = serializePortalBillingBatch({ ...base, status: 'sent' })
    expect(dto?.outstandingSatang).toBe(57_000)
    expect(dto?.dueDate).toBe('2026-10-31')
  })

  it('รอบวางบิลมีเลขที่รอบ + จำนวนเคส (มติ U62) — เลขที่สร้างจากรอบเดือน พ.ศ.', () => {
    const base = { id: 'b', totalSatang: 100_000, receivedSatang: 0, whtWithheldByCustomerSatang: 0, dueDate: new Date('2026-10-31T00:00:00Z'), sentAt: null, caseCount: 5, status: 'sent' as const }
    const dto = serializePortalBillingBatch({ ...base, period: 'มิถุนายน 2569' })
    expect(dto?.batchNumber).toBe('BB-2569-06')
    expect(dto?.caseCount).toBe(5)
    expect(serializePortalBillingBatch({ ...base, period: 'ธันวาคม 2570' })?.batchNumber).toBe('BB-2570-12')
    // รอบเดือนรูปแบบอื่น (ข้อมูลเก่า) — ไม่เดาเลข แสดงรอบเดือนอย่างเดียว
    expect(portalBillingBatchNumber('09/2569')).toBeNull()
    expect(portalBillingBatchNumber('')).toBeNull()
  })

  it('ล็อต pending_attach ดาวน์โหลดไม่ได้ · confirmed ได้', () => {
    const lot = { id: 'l', lotNumber: 'LOT-2569-001', docRef: 'DLV-2569-001', type: 'finance_pickup' as const, assetCount: 2, createdAt: CREATED, confirmedAt: null }
    expect(serializePortalLotListItem({ ...lot, status: 'pending_attach' }).downloadable).toBe(false)
    expect(serializePortalLotListItem({ ...lot, status: 'confirmed' }).downloadable).toBe(true)
  })

  it('dashboard ไม่ส่งการ์ดของหมวดที่ไม่มีสิทธิ์ (คีย์ไม่มีเลย)', () => {
    const source = { inProgressCaseCount: 3, arOutstandingSatang: 57_000, latestTaxInvoice: null, pendingLotCount: 1 }
    expect(serializePortalDashboard(source, { portal_cases: 'view', portal_handover: 'view' })).toEqual({
      inProgressCases: { count: 3 },
      pendingLots: { count: 1 },
    })
    expect(Object.keys(serializePortalDashboard(source, { portal_cases: 'view', portal_finance: 'manage' }))).toEqual([
      'inProgressCases',
      'arOutstanding',
      'latestTaxInvoice',
    ])
  })

  it('photo meta: index นอกช่วง → null', () => {
    const asset = { id: 'a', photos: ['x', 'y'] }
    expect(portalAssetPhotoMeta(asset, 1)).toEqual({ assetId: 'a', index: 1, count: 2 })
    expect(portalAssetPhotoMeta(asset, 2)).toBeNull()
    expect(portalAssetPhotoMeta(asset, -1)).toBeNull()
    expect(portalAssetPhotoMeta(asset, 0.5)).toBeNull()
  })
})
