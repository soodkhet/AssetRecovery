import { describe, expect, it } from 'vitest'
import { bangkokDayRange, buildLotCompanyGroups } from '@/lib/warehouse/lot-company-groups'

/** มติ PO U142 — ขอบวันตามเวลาไทย + การรวมยอดหัวกลุ่มต่อบริษัท */

describe('bangkokDayRange — ขอบวันตามปฏิทินไทย [gte, lt)', () => {
  it('ทั้งเดือน ต.ค. 2569 = 30/09 17:00Z ถึงก่อน 31/10 17:00Z', () => {
    expect(bangkokDayRange('2026-10-01', '2026-10-31')).toEqual({
      gte: new Date('2026-09-30T17:00:00.000Z'),
      lt: new Date('2026-10-31T17:00:00.000Z'),
    })
  })

  it('วันเดียว = 24 ชั่วโมงของวันไทย · ข้ามปีได้', () => {
    expect(bangkokDayRange('2026-12-31', '2026-12-31')).toEqual({
      gte: new Date('2026-12-30T17:00:00.000Z'),
      lt: new Date('2026-12-31T17:00:00.000Z'),
    })
  })

  it('ระบุขอบเดียวได้ · ไม่ระบุเลย = ไม่กรอง', () => {
    expect(bangkokDayRange('2026-10-01', undefined)).toEqual({ gte: new Date('2026-09-30T17:00:00.000Z') })
    expect(bangkokDayRange(undefined, '2026-10-01')).toEqual({ lt: new Date('2026-10-01T17:00:00.000Z') })
    expect(bangkokDayRange(undefined, undefined)).toBeNull()
  })
})

describe('buildLotCompanyGroups — รวมผล groupBy เป็นหัวกลุ่ม', () => {
  const names = new Map([
    ['b', 'ไฟแนนซ์ ข'],
    ['a', 'ไฟแนนซ์ ก'],
  ])

  it('นับล็อต/เครื่อง/ล็อตที่ยังไม่ยืนยันต่อบริษัท + ยอดรวม · เรียงตามชื่อ', () => {
    const summary = buildLotCompanyGroups(
      [
        { companyId: 'b', status: 'confirmed', lots: 2 },
        { companyId: 'b', status: 'pending_delivery_proof', lots: 1 },
        { companyId: 'a', status: 'confirmed', lots: 4 },
      ],
      [
        { companyId: 'a', assets: 9 },
        { companyId: 'b', assets: 5 },
      ],
      names,
    )
    expect(summary.groups).toEqual([
      { companyId: 'a', companyName: 'ไฟแนนซ์ ก', lotCount: 4, assetCount: 9, pendingLotCount: 0 },
      { companyId: 'b', companyName: 'ไฟแนนซ์ ข', lotCount: 3, assetCount: 5, pendingLotCount: 1 },
    ])
    expect(summary).toMatchObject({ totalLots: 7, totalAssets: 14, totalPendingLots: 1 })
  })

  it('เครื่องของบริษัทที่ไม่มีล็อตในเงื่อนไขไม่สร้างกลุ่มผี · ชื่อหาไม่เจอแสดง "—"', () => {
    const summary = buildLotCompanyGroups(
      [{ companyId: 'x', status: 'pending_attach', lots: 1 }],
      [{ companyId: 'zz', assets: 3 }],
      names,
    )
    expect(summary.groups).toEqual([
      { companyId: 'x', companyName: '—', lotCount: 1, assetCount: 0, pendingLotCount: 1 },
    ])
  })

  it('ไม่มีข้อมูล = กลุ่มว่าง ยอดศูนย์', () => {
    expect(buildLotCompanyGroups([], [], names)).toEqual({
      groups: [],
      totalLots: 0,
      totalAssets: 0,
      totalPendingLots: 0,
    })
  })
})
