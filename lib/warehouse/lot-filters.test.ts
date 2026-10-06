import { describe, expect, it } from 'vitest'
import {
  DELIVERED_STATUS_OPTIONS,
  EMPTY_LOT_FILTERS,
  FILTER_ALL,
  buildLotCompanySummaryQuery,
  buildLotListQuery,
  companyOptionsFromLots,
  currentMonthKey,
  initialLotFilters,
  lotFilterOptionsOrFallback,
  monthDayRange,
  shiftMonthKey,
  withDeliveredDate,
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

  it('แท็บ "รอส่งมอบ" ส่งวันที่เป็นวันนัด (dateFrom/dateTo) ไม่ส่งช่วงวันส่งมอบ', () => {
    const pending = buildLotListQuery('pending_handover', { ...EMPTY_LOT_FILTERS, date: '2026-07-10' }, 1, 50)
    expect(pending).toMatchObject({ dateFrom: '2026-07-10', dateTo: '2026-07-10' })
    expect(pending).not.toHaveProperty('handedOverFrom')
  })

  it('มติ U142 — แท็บ "ส่งมอบแล้ว" กรองวันส่งมอบที่ server: เดือน = ทั้งเดือน · วันเดียวชนะเดือน', () => {
    const month = buildLotListQuery('handed_over', { ...EMPTY_LOT_FILTERS, month: '2026-02' }, 1, 20)
    expect(month).toMatchObject({ handedOverFrom: '2026-02-01', handedOverTo: '2026-02-28' })
    expect(month).not.toHaveProperty('dateFrom')

    const day = buildLotListQuery('handed_over', { ...EMPTY_LOT_FILTERS, month: '2026-07', date: '2026-07-10' }, 1, 20)
    expect(day).toMatchObject({ handedOverFrom: '2026-07-10', handedOverTo: '2026-07-10' })

    expect(buildLotListQuery('handed_over', EMPTY_LOT_FILTERS, 1, 20)).not.toHaveProperty('handedOverFrom')
  })

  it('query ของยอดหัวกลุ่ม = ตัวกรองชุดเดียวกับ list แต่ไม่มี page/limit', () => {
    const filters = { ...EMPTY_LOT_FILTERS, month: '2026-10', search: 'LOT', status: 'confirmed', companyId: 'co-1' }
    const summary = buildLotCompanySummaryQuery('handed_over', filters)
    const { page: _page, limit: _limit, ...list } = buildLotListQuery('handed_over', filters, 3, 20)
    expect(summary).toEqual(list)
    expect(summary).not.toHaveProperty('page')
    expect(summary).not.toHaveProperty('limit')
  })
})

describe('มติ U142 — เดือนของแท็บ "ส่งมอบแล้ว" (เวลาไทย)', () => {
  it('ค่าเริ่มต้น = เดือนปัจจุบันตามเวลาไทย (ขอบเดือน: 31/10 18:00Z = 01/11 ไทย)', () => {
    expect(currentMonthKey(new Date('2026-10-31T16:59:59Z'))).toBe('2026-10')
    expect(currentMonthKey(new Date('2026-10-31T17:00:00Z'))).toBe('2026-11')
    expect(initialLotFilters('handed_over', new Date('2026-12-31T18:00:00Z')).month).toBe('2027-01')
    expect(initialLotFilters('pending_handover', new Date('2026-10-06T00:00:00Z')).month).toBe('')
  })

  it('เลื่อนเดือนข้ามปีได้ทั้งสองทาง', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    expect(shiftMonthKey('2026-10', 0)).toBe('2026-10')
  })

  it('ช่วงวันของเดือน — ก.พ. ปีอธิกสุรทิน 29 วัน · ธ.ค. 31 วัน', () => {
    expect(monthDayRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthDayRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('เลือกวันเดียว = เดือนที่แสดงขยับตาม · ล้างวัน = คงเดือนเดิม', () => {
    const base = { ...EMPTY_LOT_FILTERS, month: '2026-10' }
    expect(withDeliveredDate(base, '2026-08-15')).toMatchObject({ date: '2026-08-15', month: '2026-08' })
    expect(withDeliveredDate({ ...base, date: '2026-10-02' }, '')).toMatchObject({ date: '', month: '2026-10' })
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
