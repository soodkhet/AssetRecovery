import { describe, expect, it } from 'vitest'
import type { AssetStatus } from '@/lib/generated/prisma/enums'
import {
  EMPTY_ASSET_FILTERS,
  buildAssetListQuery,
  filterByReceivedDate,
  filterOptionsOrFallback,
  groupCustodyByCompany,
  isSelectableForLot,
  keepSelectable,
  matchesAssetSearch,
  optionsFromAssets,
  selectableAssetIds,
  statusesOnWarehouseTab,
} from '@/lib/warehouse/asset-filters'
import type { AssetListItemDto } from '@/lib/warehouse/types'

function asset(overrides: Partial<AssetListItemDto> & { id: string }): AssetListItemDto {
  return {
    caseId: `case-${overrides.id}`,
    caseRef: `REF-${overrides.id}`,
    debtorName: 'ลูกหนี้',
    deviceDesc: 'iPhone 13',
    imeiContract: '123456789012345',
    imeiActual: null,
    serialContract: null,
    serialActual: null,
    assetStatus: 'in_custody' as AssetStatus,
    condition: null,
    conditionNote: null,
    companyId: 'company-a',
    companyName: 'บริษัท A',
    teamId: 'team-1',
    teamName: 'ทีมกรุงเทพ',
    agentId: 'agent-1',
    agentName: 'สมชาย',
    closedAt: '2026-07-01T03:00:00.000Z',
    receivedAt: null,
    rejectReason: null,
    rejectedAt: null,
    lotId: null,
    lotNumber: null,
    photoCount: 0,
    ...overrides,
  }
}

describe('buildAssetListQuery', () => {
  it('ไม่เลือกสถานะ = ส่งสถานะทั้งหมดของแท็บ (กันเครื่องข้ามแท็บ)', () => {
    expect(buildAssetListQuery('intake', EMPTY_ASSET_FILTERS, 1, 20)).toEqual({
      status: 'pending_intake,intake_rejected',
      page: 1,
      limit: 20,
    })
  })

  it('แท็บ "ในคลัง" ดึงทั้ง in_custody และ handover_pending (`44` §8.1 — การ์ดต้องแยกพร้อมส่ง/ใน Lot ได้)', () => {
    expect(statusesOnWarehouseTab('in_custody')).toEqual(['in_custody', 'handover_pending'])
    expect(buildAssetListQuery('in_custody', EMPTY_ASSET_FILTERS, 1, 20).status).toBe('in_custody,handover_pending')
  })

  it('แท็บอื่นใช้สถานะตาม `statusesInAssetTab()` ตรง ๆ', () => {
    expect(statusesOnWarehouseTab('intake')).toEqual(['pending_intake', 'intake_rejected'])
    expect(statusesOnWarehouseTab('handed_over')).toEqual(['handed_over'])
  })

  it('เลือกสถานะที่อยู่ในแท็บ = ส่งเฉพาะตัวนั้น', () => {
    const query = buildAssetListQuery('intake', { ...EMPTY_ASSET_FILTERS, status: 'intake_rejected' }, 2, 50)
    expect(query).toMatchObject({ status: 'intake_rejected', page: 2, limit: 50 })
  })

  it('สถานะที่ไม่ได้อยู่ในแท็บถูกเมิน (กันค่าค้างจากแท็บก่อนหน้า)', () => {
    const query = buildAssetListQuery('intake', { ...EMPTY_ASSET_FILTERS, status: 'handed_over' }, 1, 20)
    expect(query.status).toBe('pending_intake,intake_rejected')
  })

  it('วันปิดเคสวันเดียว = dateFrom เท่ากับ dateTo', () => {
    const query = buildAssetListQuery('intake', { ...EMPTY_ASSET_FILTERS, closedDate: '2026-07-02' }, 1, 20)
    expect(query.dateFrom).toBe('2026-07-02')
    expect(query.dateTo).toBe('2026-07-02')
  })

  it('ส่งเฉพาะ filter ที่ผู้ใช้เลือก + ตัดช่องว่างของคำค้น', () => {
    const query = buildAssetListQuery(
      'intake',
      {
        search: '  123456789012345  ',
        closedDate: '',
        companyId: 'company-a',
        teamId: 'team-1',
        agentId: 'agent-1',
        condition: 'damaged',
        status: 'all',
      },
      1,
      20,
    )
    expect(query).toEqual({
      status: 'pending_intake,intake_rejected',
      page: 1,
      limit: 20,
      search: '123456789012345',
      companyId: 'company-a',
      teamId: 'team-1',
      agentId: 'agent-1',
      condition: 'damaged',
    })
  })
})

describe('optionsFromAssets / filterOptionsOrFallback', () => {
  const items = [
    asset({ id: '1', teamId: 'team-b', teamName: 'ขอนแก่น', agentId: 'agent-1', agentName: 'สมชาย' }),
    asset({ id: '2', teamId: 'team-a', teamName: 'กรุงเทพ', agentId: 'agent-1', agentName: 'สมชาย' }),
    asset({ id: '3', teamId: null, teamName: null, agentId: null, agentName: null }),
  ]

  it('รวมค่าไม่ซ้ำ + ข้ามแถวที่ไม่มีค่า + เรียงตามชื่อ', () => {
    expect(optionsFromAssets(items, 'team')).toEqual([
      { id: 'team-a', name: 'กรุงเทพ' },
      { id: 'team-b', name: 'ขอนแก่น' },
    ])
    expect(optionsFromAssets(items, 'agent')).toEqual([{ id: 'agent-1', name: 'สมชาย' }])
  })

  it('มีตัวเลือกจาก master data = ใช้ตัวนั้น · ไม่มี (เรียก API ไม่ได้) = ถอยไปใช้ค่าที่พบในแถว', () => {
    const fromApi = [{ id: 'team-z', name: 'ทีมแซด' }]
    expect(filterOptionsOrFallback(fromApi, items, 'team')).toEqual(fromApi)
    expect(filterOptionsOrFallback([], items, 'team')).toHaveLength(2)
  })
})

describe('groupCustodyByCompany (`44` §8.3)', () => {
  it('1 การ์ด = 1 บริษัท พร้อม breakdown พร้อมส่ง/ใน Lot + สภาพ', () => {
    const groups = groupCustodyByCompany([
      asset({ id: '1', condition: 'normal' }),
      asset({ id: '2', condition: 'damaged' }),
      asset({ id: '3', assetStatus: 'handover_pending', lotId: 'lot-1', lotNumber: 'LOT-2569-001' }),
      asset({ id: '4', companyId: 'company-b', companyName: 'บริษัท B' }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      companyId: 'company-a',
      total: 3,
      ready: 2,
      inLot: 1,
      byCondition: { normal: 1, damaged: 1 },
    })
    expect(groups[1]).toMatchObject({ companyId: 'company-b', total: 1, ready: 1, inLot: 0 })
  })

  it('ไม่มีเครื่อง = ไม่มีการ์ด', () => {
    expect(groupCustodyByCompany([])).toEqual([])
  })
})

describe('isSelectableForLot / selectableAssetIds / keepSelectable', () => {
  it('เลือกได้เฉพาะ in_custody ที่ยังไม่มีล็อต (`44` §10)', () => {
    expect(isSelectableForLot(asset({ id: '1' }))).toBe(true)
    expect(isSelectableForLot(asset({ id: '2', assetStatus: 'handover_pending', lotId: 'lot-1' }))).toBe(false)
    expect(isSelectableForLot(asset({ id: '3', lotId: 'lot-1' }))).toBe(false)
    expect(isSelectableForLot(asset({ id: '4', assetStatus: 'pending_intake' }))).toBe(false)
  })

  it('selectableAssetIds คืนเฉพาะ id ที่ติ๊กได้', () => {
    const items = [asset({ id: '1' }), asset({ id: '2', assetStatus: 'handover_pending', lotId: 'lot-1' })]
    expect(selectableAssetIds(items)).toEqual(['1'])
  })

  it('keepSelectable ตัด id ที่หลุดจากรายการที่มองเห็น (กันส่งเครื่องที่ถูกกรองออกเข้าล็อต)', () => {
    const items = [asset({ id: '1' }), asset({ id: '2', lotId: 'lot-1', assetStatus: 'handover_pending' })]
    expect(keepSelectable(['1', '2', 'ghost'], items)).toEqual(['1'])
  })
})

describe('matchesAssetSearch', () => {
  const item = asset({
    id: '1',
    caseRef: 'CT-2569-0007',
    debtorName: 'สมหญิง ใจดี',
    deviceDesc: 'iPhone 13 Pro',
    imeiContract: '123456789012345',
    imeiActual: '999999999999999',
    serialContract: 'SN-ABC',
  })

  it('คำค้นว่าง = ผ่านทุกแถว', () => {
    expect(matchesAssetSearch(item, '   ')).toBe(true)
  })

  it('เลขสัญญา/ชื่อลูกหนี้/อุปกรณ์ ค้นแบบ contains ไม่สนตัวพิมพ์', () => {
    expect(matchesAssetSearch(item, '0007')).toBe(true)
    expect(matchesAssetSearch(item, 'สมหญิง')).toBe(true)
    expect(matchesAssetSearch(item, 'iphone')).toBe(true)
    expect(matchesAssetSearch(item, 'ไม่มีคำนี้')).toBe(false)
  })

  it('IMEI/serial เทียบ exact เท่านั้น — ห้าม fuzzy (`44` §6.5)', () => {
    expect(matchesAssetSearch(item, '123456789012345')).toBe(true)
    expect(matchesAssetSearch(item, '999999999999999')).toBe(true)
    expect(matchesAssetSearch(item, 'SN-ABC')).toBe(true)
    // ต่างกันหลักเดียว / เป็นแค่บางส่วนของเลข = ไม่ตรง
    expect(matchesAssetSearch(item, '123456789012344')).toBe(false)
    expect(matchesAssetSearch(item, '12345678901234')).toBe(false)
  })
})

describe('filterByReceivedDate', () => {
  const items = [
    // 2026-07-01T18:00Z = 02/07/2026 01:00 น. เวลาไทย ⇒ ต้องนับเป็นวันที่ 2 ไม่ใช่วันที่ 1
    asset({ id: '1', receivedAt: '2026-07-01T18:00:00.000Z' }),
    asset({ id: '2', receivedAt: '2026-07-02T09:00:00.000Z' }),
    asset({ id: '3', receivedAt: null }),
  ]

  it('ไม่ระบุวัน = คืนทุกแถว', () => {
    expect(filterByReceivedDate(items, '')).toHaveLength(3)
  })

  it('เทียบวันตามเวลาไทย ไม่ใช่ UTC', () => {
    expect(filterByReceivedDate(items, '2026-07-02').map((item) => item.id)).toEqual(['1', '2'])
    expect(filterByReceivedDate(items, '2026-07-01')).toEqual([])
  })
})
