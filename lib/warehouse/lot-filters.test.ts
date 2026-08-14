import { describe, expect, it } from 'vitest'
import {
  DELIVERED_STATUS_OPTIONS,
  EMPTY_LOT_FILTERS,
  FILTER_ALL,
  buildLotListQuery,
  companyOptionsFromLots,
  filterByDeliveredDate,
  lotFilterOptionsOrFallback,
} from '@/lib/warehouse/lot-filters'
import type { LotSummaryDto } from '@/lib/warehouse/types'

/**
 * ยามของตัวกรอง 2 แท็บล็อต (`44` §8.4–8.5)
 * — จุดที่พังง่ายที่สุดคือ "ไม่เลือกสถานะ" แล้วหลุดไปเห็นล็อตของอีกแท็บ (§9.3)
 */

function lot(overrides: Partial<LotSummaryDto> = {}): LotSummaryDto {
  return {
    id: 'lot-1',
    lotNumber: 'LOT-2569-001',
    docRef: 'DLV-2569-001',
    type: 'finance_pickup',
    status: 'confirmed',
    companyId: 'co-1',
    companyName: 'ไฟแนนซ์ ก',
    scheduledAt: null,
    deliveredAt: null,
    confirmedAt: null,
    assetCount: 3,
    tab: 'handed_over',
    ...overrides,
  }
}

describe('buildLotListQuery — สถานะของแท็บต้องติดไปเสมอ', () => {
  it('แท็บ "รอส่งมอบ" ส่งเฉพาะ pending_attach', () => {
    expect(buildLotListQuery('pending_handover', EMPTY_LOT_FILTERS, 1, 50)).toEqual({
      status: 'pending_attach',
      page: 1,
      limit: 50,
    })
  })

  it('แท็บ "ส่งมอบแล้ว" ส่ง 2 สถานะ (pending_delivery_proof + confirmed) เมื่อไม่กรอง', () => {
    const query = buildLotListQuery('handed_over', EMPTY_LOT_FILTERS, 2, 20)
    expect(query.status).toBe('pending_delivery_proof,confirmed')
    expect(query).toMatchObject({ page: 2, limit: 20 })
  })

  it('เลือกสถานะเดียวในแท็บ "ส่งมอบแล้ว" = ส่งสถานะนั้นตัวเดียว', () => {
    expect(buildLotListQuery('handed_over', { ...EMPTY_LOT_FILTERS, status: 'confirmed' }, 1, 50).status).toBe(
      'confirmed',
    )
  })

  it('สถานะที่ไม่อยู่ในแท็บถูกเมิน — ถอยกลับไปใช้สถานะทั้งแท็บ (กันเห็นล็อตข้ามแท็บ)', () => {
    expect(buildLotListQuery('handed_over', { ...EMPTY_LOT_FILTERS, status: 'pending_attach' }, 1, 50).status).toBe(
      'pending_delivery_proof,confirmed',
    )
  })

  it('search/companyId ติดไปเมื่อกรอก · ค่าว่างไม่ส่งคีย์เปล่า', () => {
    const query = buildLotListQuery(
      'pending_handover',
      { ...EMPTY_LOT_FILTERS, search: '  LOT-2569  ', companyId: 'co-9' },
      1,
      50,
    )
    expect(query).toMatchObject({ search: 'LOT-2569', companyId: 'co-9' })
    expect(buildLotListQuery('pending_handover', { ...EMPTY_LOT_FILTERS, companyId: FILTER_ALL }, 1, 50)).not.toHaveProperty(
      'companyId',
    )
  })

  it('วันที่ส่งให้ API เฉพาะแท็บ "รอส่งมอบ" (API กรองได้แค่วันนัด — `44` §15)', () => {
    const pending = buildLotListQuery('pending_handover', { ...EMPTY_LOT_FILTERS, date: '2026-07-10' }, 1, 50)
    expect(pending).toMatchObject({ dateFrom: '2026-07-10', dateTo: '2026-07-10' })

    const delivered = buildLotListQuery('handed_over', { ...EMPTY_LOT_FILTERS, date: '2026-07-10' }, 1, 50)
    expect(delivered).not.toHaveProperty('dateFrom')
    expect(delivered).not.toHaveProperty('dateTo')
  })
})

describe('filterByDeliveredDate — เทียบวันตามเวลาไทย', () => {
  const rows = [
    lot({ id: 'a', deliveredAt: '2026-07-09T17:30:00Z' }), // = 10/07 00:30 เวลาไทย
    lot({ id: 'b', deliveredAt: '2026-07-10T09:00:00Z' }),
    lot({ id: 'c', status: 'pending_delivery_proof', deliveredAt: null }),
  ]

  it('ว่าง = ไม่กรอง', () => {
    expect(filterByDeliveredDate(rows, '')).toHaveLength(3)
  })

  it('กรองตามวันไทย — ล็อตที่ยังไม่มีวันส่งมอบถูกตัดออก', () => {
    expect(filterByDeliveredDate(rows, '2026-07-10').map((each) => each.id)).toEqual(['a', 'b'])
    expect(filterByDeliveredDate(rows, '2026-07-09')).toEqual([])
  })
})

describe('ตัวเลือกบริษัท', () => {
  it('ถอยไปใช้ค่าที่พบในล็อตเมื่อเรียก master data ไม่ได้ (เรียงตามชื่อ ไม่ซ้ำ)', () => {
    const rows = [
      lot({ id: '1', companyId: 'c2', companyName: 'ไฟแนนซ์ ข' }),
      lot({ id: '2', companyId: 'c1', companyName: 'ไฟแนนซ์ ก' }),
      lot({ id: '3', companyId: 'c2', companyName: 'ไฟแนนซ์ ข' }),
    ]
    expect(companyOptionsFromLots(rows)).toEqual([
      { id: 'c1', name: 'ไฟแนนซ์ ก' },
      { id: 'c2', name: 'ไฟแนนซ์ ข' },
    ])
    expect(lotFilterOptionsOrFallback([{ id: 'x', name: 'จาก API' }], rows)).toEqual([{ id: 'x', name: 'จาก API' }])
    expect(lotFilterOptionsOrFallback([], rows)).toHaveLength(2)
  })
})

describe('DELIVERED_STATUS_OPTIONS', () => {
  it('มี 2 สถานะของแท็บ "ส่งมอบแล้ว" ตาม §9.3', () => {
    expect([...DELIVERED_STATUS_OPTIONS]).toEqual(['pending_delivery_proof', 'confirmed'])
  })
})
