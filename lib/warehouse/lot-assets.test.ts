import { describe, expect, it } from 'vitest'
import type { ModuleError } from '@/lib/api/errors'
import { assertLotAssets, type LotAssetCandidate } from '@/lib/warehouse/lot-assets'

/** `44` §10 · §12 — T05/T06 ของ §17 */

const COMPANY_A = 'company-a'
const COMPANY_B = 'company-b'

function asset(overrides: Partial<LotAssetCandidate> & { id: string }): LotAssetCandidate {
  return {
    companyId: COMPANY_A,
    assetStatus: 'in_custody',
    lotId: null,
    lotNumber: null,
    ...overrides,
  }
}

function contextOf(run: () => void): Record<string, unknown> | undefined {
  try {
    run()
  } catch (error) {
    return (error as ModuleError).context
  }
  return undefined
}

describe('assertLotAssets', () => {
  it('เลือกเครื่องในคลังของบริษัทเดียวกัน = ผ่าน', () => {
    expect(() =>
      assertLotAssets({
        requestedIds: ['a1', 'a2'],
        companyId: COMPANY_A,
        assets: [asset({ id: 'a1' }), asset({ id: 'a2' })],
      }),
    ).not.toThrow()
  })

  it('T06 — ไม่เลือกเครื่องเลย = EMPTY_LOT', () => {
    expect(() => assertLotAssets({ requestedIds: [], companyId: COMPANY_A, assets: [] })).toThrowError(/EMPTY_LOT/)
  })

  it('เครื่องที่หาไม่เจอ/อยู่นอก scope = ASSET_NOT_FOUND (ข้อความเดียวกัน ไม่ leak)', () => {
    const context = contextOf(() =>
      assertLotAssets({ requestedIds: ['a1', 'ghost'], companyId: COMPANY_A, assets: [asset({ id: 'a1' })] }),
    )
    expect(context).toEqual({ assetIds: ['ghost'] })
  })

  it('T05 — ปนบริษัท = MIXED_COMPANY_LOT พร้อมบอกบริษัทที่ปนมา', () => {
    const run = () =>
      assertLotAssets({
        requestedIds: ['a1', 'b1'],
        companyId: COMPANY_A,
        assets: [asset({ id: 'a1' }), asset({ id: 'b1', companyId: COMPANY_B })],
      })
    expect(run).toThrowError(/MIXED_COMPANY_LOT/)
    expect(contextOf(run)).toEqual({ expectedCompanyId: COMPANY_A, foundCompanyIds: [COMPANY_B] })
  })

  it('เครื่องที่ยังไม่รับเข้าคลัง = ASSET_NOT_IN_CUSTODY', () => {
    for (const assetStatus of ['pending_intake', 'intake_rejected', 'handed_over'] as const) {
      const run = () =>
        assertLotAssets({
          requestedIds: ['a1'],
          companyId: COMPANY_A,
          assets: [asset({ id: 'a1', assetStatus })],
        })
      expect(run).toThrowError(/ASSET_NOT_IN_CUSTODY/)
      expect(contextOf(run)).toEqual({ assetIds: ['a1'] })
    }
  })

  it('เครื่องที่อยู่ในล็อตอื่นแล้ว = ASSET_ALREADY_IN_LOT พร้อมเลขล็อตเดิม', () => {
    const run = () =>
      assertLotAssets({
        requestedIds: ['a1'],
        companyId: COMPANY_A,
        // `handover_pending` ถูกจับที่ด่านสถานะก่อน — เคสนี้จำลองเครื่องที่ยังเป็น in_custody แต่มี lot ค้าง
        assets: [asset({ id: 'a1', lotId: 'lot-1', lotNumber: 'LOT-2569-001' })],
      })
    expect(run).toThrowError(/ASSET_ALREADY_IN_LOT/)
    expect(contextOf(run)).toEqual({ assetIds: ['a1'], lotNumbers: ['LOT-2569-001'] })
  })

  it('ลำดับด่าน: ว่าง → ไม่พบ → ปนบริษัท → ไม่อยู่ในคลัง → อยู่ในล็อตแล้ว', () => {
    // ผิดหลายข้อพร้อมกันต้องได้ error ของด่านแรกสุดเสมอ (ผู้ใช้แก้ทีละเรื่อง)
    expect(() =>
      assertLotAssets({
        requestedIds: ['a1', 'ghost'],
        companyId: COMPANY_A,
        assets: [asset({ id: 'a1', companyId: COMPANY_B, assetStatus: 'pending_intake', lotId: 'lot-1' })],
      }),
    ).toThrowError(/ASSET_NOT_FOUND/)

    expect(() =>
      assertLotAssets({
        requestedIds: ['a1'],
        companyId: COMPANY_A,
        assets: [asset({ id: 'a1', companyId: COMPANY_B, assetStatus: 'pending_intake' })],
      }),
    ).toThrowError(/MIXED_COMPANY_LOT/)
  })
})
